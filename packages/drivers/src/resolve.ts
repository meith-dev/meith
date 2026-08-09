/**
 * The one place driver implementations are chosen (F05).
 *
 * Everything downstream receives a `Drivers` bundle and never asks which
 * implementation it holds. If a `if (env.QUEUE_DRIVER === ...)` appears in a
 * domain package or a route, that is the bug this module exists to prevent.
 */

import {
  ConfigurationError,
  env,
  type CacheDriver,
  type Drivers,
  type FileStore,
  type MailDriver,
  type QueueDriver,
} from '@meith/core'

import { PostgresSettingsRepository, getDb } from '@meith/db'
import {
  NO_MAIL,
  SettingsSnapshot,
  mailConfigFromEnvironment,
  mailConfigFromSettings,
  type MailConfig,
} from '@meith/settings'

import { NextCacheDriver } from './cache/next-cache'
import { LocalFileStore } from './files/local-file-store'
import { S3FileStore } from './files/s3-file-store'
import { ConfiguredMailDriver } from './mail'
import { MemoryQueue } from './queue/memory-queue'
import { PostgresQueue } from './queue/postgres-queue'

/**
 * Cached per process.
 *
 * Drivers hold connections and in-memory state, so rebuilding them per request
 * would both leak sockets and silently empty the memory cache on every request.
 */
let bundle: Drivers | undefined

function buildQueue(): QueueDriver {
  switch (env.QUEUE_DRIVER) {
    case 'postgres':
      return new PostgresQueue()
    case 'memory':
      return new MemoryQueue()
    case 'redis':
      /*
       * Deliberately unimplemented rather than silently downgraded: an operator
       * who sets QUEUE_DRIVER=redis and gets an in-memory queue would lose every
       * job on each cold start with no indication anything was wrong.
       */
      throw new ConfigurationError(
        'QUEUE_DRIVER=redis is not implemented yet. Use "postgres".',
      )
  }
}

/**
 * `memory` chooses the **storage**, never whether invalidation works.
 *
 * Both cases return `NextCacheDriver`, and that is a fix rather than the option
 * being ignored: `NextCacheDriver`'s `get`/`set` *are* a `MemoryCache`, so an
 * operator who asked for process-local storage gets exactly that. The only
 * thing it adds is that `invalidateTags` also calls `revalidateTag`.
 *
 * It has to. Four of this board's global reads live in Next's data cache rather
 * than in the driver — `activeWordFilter` and the markdown vocabulary in
 * `content-admin.ts`, the styled-group set in `group-identity.ts`, and the
 * board style in `theme-runtime.ts` — all tagged with the same `CacheTags`
 * vocabulary every writer invalidates through. A driver whose `invalidateTags`
 * only swept its own map therefore purged half of what the tag names, and the
 * half it missed is the half the control panel edits.
 *
 * What that looked like on a `CACHE_DRIVER=memory` board: an administrator adds
 * a word filter, saves a smiley, changes a group's colour or edits a theme
 * token — the panel confirms the write, the row is in the table, and **the
 * board goes on rendering the old value indefinitely**, because nothing will
 * ever expire the entry. No error, no stale-for-a-minute; just a control panel
 * whose four content screens do nothing until the process restarts. Found by
 * `admin-no-js.spec.ts`, which adds a filter and then reads the post.
 *
 * The forward is safe in every process this repo runs, and was already being
 * made in all of them: `next` is the derived default on a Postgres board, so
 * `apps/worker` and the CLI have been calling `revalidateTag` through this same
 * driver since F05.
 */
function buildCache(): CacheDriver {
  switch (env.CACHE_DRIVER) {
    case 'next':
    case 'memory':
      return new NextCacheDriver()
    case 'redis':
      throw new ConfigurationError(
        'CACHE_DRIVER=redis is not implemented yet. Use "next" or "memory".',
      )
  }
}

function buildFiles(): FileStore {
  switch (env.FILESTORE_DRIVER) {
    case 'local':
      return new LocalFileStore(env.UPLOADS_DIR)
    case 's3':
      /*
       * Statically imported, deliberately.
       *
       * The ADR originally required a lazy `require()` to keep the AWS client
       * out of bundles. Two measurements killed that: a literal `require()` is
       * statically analysable, so the bundler inlines the module anyway (it
       * defers execution, not inclusion), and `require` inside an ESM package
       * throws outright in plain Node — which is what the CLI and worker run on.
       *
       * What actually keeps it out of the compiled chunks is
       * `serverExternalPackages` in next.config, where it is listed alongside
       * postgres. See D34.
       */
      return S3FileStore.fromEnv(env)
  }
}

/**
 * The mail configuration, as of right now.
 *
 * Exported so the health view and the settings screen can ask the same question
 * the driver asks, through the same precedence rule, rather than each
 * reimplementing "does the environment override this".
 *
 * Reads the settings table directly rather than through the app's cached
 * `getSettings()`, for the reason `resolveMailBrand` already does: this runs in
 * the worker and in the CLI, neither of which has Next's data cache, and a mail
 * job must not depend on a caching layer that only exists in one of the three
 * processes that send mail.
 */
export async function currentMailConfig(): Promise<MailConfig> {
  const fromEnvironment = mailConfigFromEnvironment(env)
  if (fromEnvironment !== null) return fromEnvironment

  /*
   * Fixture mode has no `settings` table. Every other source of configuration
   * has already been consulted by this point, so the honest answer is that this
   * board sends nothing — which is also the right default for the development
   * and test runs that fixture mode exists for.
   */
  if (env.DATA_SOURCE !== 'postgres') return NO_MAIL

  const overrides = await new PostgresSettingsRepository(getDb()).loadAll()
  return mailConfigFromSettings(SettingsSnapshot.fromOverrides(new Map(overrides)))
}

/**
 * Mail is the one driver not chosen here.
 *
 * Every other driver in this file is selected by an environment variable and
 * fixed for the life of the process, which is correct for a queue or a file
 * store: changing one is a deployment decision. Mail is not. It is board
 * configuration an administrator edits — see `@meith/settings/mail` — so what
 * this returns is a driver that resolves its own transport per message.
 *
 * That also removes the `MAIL_DRIVER=smtp` refusal that used to live here.
 * SMTP is implemented now (see `mail/smtp.ts`), and the reason it was not — a
 * serverless host freezing a function mid-handshake — went away with D105.
 */
function buildMail(): MailDriver {
  return new ConfiguredMailDriver(currentMailConfig)
}

export function drivers(): Drivers {
  bundle ??= {
    queue: buildQueue(),
    cache: buildCache(),
    files: buildFiles(),
    mail: buildMail(),
  }
  return bundle
}

/** Test-only: forces the next `drivers()` call to rebuild from current env. */
export function resetDriversForTests(): void {
  bundle = undefined
}
