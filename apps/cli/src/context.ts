/**
 * The CLI's composition root.
 *
 * `apps/community` has its own (`src/server/container.ts`) and this deliberately
 * does not import it: that one is `server-only` and pulls in `next/headers`,
 * which has no meaning in a plain Node process. What the two must share is
 * *policy*, not wiring — hence `DEFAULT_AUTH_POLICY` and `resolveAuthPolicy` in
 * `@meith/accounts`, so a user created here satisfies exactly the rules the
 * registration form enforces, including the ones the board configured itself.
 *
 * Postgres only. Every command below mutates a board an operator intends to
 * keep, and the fixture store lives in the heap of whichever process happens to
 * be running — `community user:create` against it would report success and change
 * nothing, which is worse than refusing.
 */
import {
  DEFAULT_AUTH_POLICY,
  IdentityService,
  resolveAuthPolicy,
  type AuthConfig,
} from '@meith/accounts'
import { ConfigurationError, env } from '@meith/core'
import {
  PostgresAdminRepository,
  PostgresForumRepository,
  PostgresSettingsRepository,
  createPostgresAccountStore,
  getDb,
  type Database,
} from '@meith/db'
import { SettingsSnapshot } from '@meith/settings'

export interface CliContext {
  readonly db: Database
  readonly identity: IdentityService
  readonly forums: PostgresForumRepository
  readonly settings: PostgresSettingsRepository
  readonly admin: PostgresAdminRepository
}

/**
 * Refuse anything but a real database, with a message that says what to do.
 *
 * Checked once here rather than per command so no command can forget it.
 */
export function requirePostgres(): void {
  if (env.DATA_SOURCE !== 'postgres') {
    throw new ConfigurationError(
      'This command needs a database: DATA_SOURCE is "fixture".\n' +
        'Set DATABASE_URL (see .env.example) and run `community migrate` first.',
    )
  }
}

/**
 * The registered group, resolved by key rather than by id.
 *
 * The seed migration pins registered to id 2, but keying off the *name* is what
 * `usergroups.key` exists for — a board that has rebuilt its ladder still has a
 * group called `registered`, and a hardcoded 2 would silently file new accounts
 * into whatever now occupies that id.
 */
export async function defaultMemberGroupId(admin: PostgresAdminRepository): Promise<number> {
  const id = await admin.registeredGroupId()
  if (id === null) {
    throw new ConfigurationError(
      'No "registered" usergroup found. Run `community migrate` to seed the group ladder.',
    )
  }
  return id
}

/** Build the services, after asserting the environment can support them. */
export async function createContext(): Promise<CliContext> {
  requirePostgres()
  const db = getDb()
  const admin = new PostgresAdminRepository(db)

  const settings = new PostgresSettingsRepository(db)

  /*
   * The board's own password and username rules, read from the settings table
   * this CLI can already write to.
   *
   * This is the whole reason `DEFAULT_AUTH_POLICY` exists — "a user created
   * here satisfies exactly the rules the registration form enforces" — and it
   * stopped being true the moment those three settings gained a reader in the
   * app. A CLI still enforcing the built-in 8 characters on a board that asked
   * for 16 is a way to create accounts weaker than the board's own rule.
   */
  const stored = SettingsSnapshot.fromOverrides(await settings.loadAll())

  const config: AuthConfig = {
    ...DEFAULT_AUTH_POLICY,
    ...resolveAuthPolicy((key) => stored.get(key as never), {
      ...DEFAULT_AUTH_POLICY,
      activationMethod: 'none',
    }),
    /*
     * 'none' — an operator at a terminal has already proven more than an email
     * round-trip would, and cannot click a link in somebody else's mailbox.
     * Making `community user:create` mint an inactive account would mean the first
     * administrator could not log in to activate anyone, including themselves.
     *
     * Deliberately *after* the spread: the board's activation method is
     * resolved with everything else and then overruled here, because this is
     * the one field where the CLI is not the board.
     */
    activationMethod: 'none',
    defaultMemberGroupId: await defaultMemberGroupId(admin),
  }

  return {
    db,
    identity: new IdentityService({ store: createPostgresAccountStore(db), config }),
    forums: new PostgresForumRepository(db),
    settings,
    admin,
  }
}
