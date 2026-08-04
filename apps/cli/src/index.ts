#!/usr/bin/env node
/**
 * F13 — operator CLI.
 *
 * Everything an operator must do without a browser: inspect configuration, run
 * migrations, drain the queue, force a tick, seed sample data.
 *
 * Deliberately a *thin* layer. Each subcommand delegates to the same code the
 * app uses, so a CLI path cannot drift from the request path — the class of bug
 * where `forum settings:set` writes a value the app then rejects.
 */

import process from 'node:process'

import { loadEnvFiles, type LoadedEnvFiles } from '@meith/core/env-files'

import { importCommand } from './import'
import { searchReindex } from './search'
import { taskList, taskRun } from './tasks'
import {
  profileFieldAdd,
  profileFieldList,
  profileFieldRemove,
} from './profile-fields'
import {
  forumCreate,
  settingsGet,
  settingsSet,
  userCreate,
  userPromote,
} from './commands'

interface Command {
  readonly name: string
  readonly summary: string
  readonly usage?: string
  run(args: readonly string[]): Promise<number>
}

/** Printed for `--help` and on unknown input. */
function usage(commands: readonly Command[]): string {
  const width = Math.max(...commands.map((c) => c.name.length))
  const lines = commands.map(
    (c) => `  ${c.name.padEnd(width)}  ${c.summary}`,
  )
  return [
    'forum — operator CLI',
    '',
    'Usage: forum <command> [options]',
    '',
    'Commands:',
    ...lines,
    '',
  ].join('\n')
}

const commands: Command[] = [
  {
    name: 'env:check',
    summary: 'Validate environment variables and print the resolved config.',
    async run() {
      /*
       * Imported lazily inside run() rather than at module top level. A failed
       * validation must be reported by *this* command with a readable message;
       * a top-level import would throw during module evaluation, before the
       * command dispatcher could attach any context.
       */
      const { assertEnv } = await import('@meith/core')

      let env
      try {
        env = assertEnv()
      } catch (error) {
        console.error('Environment is invalid:\n')
        console.error(error instanceof Error ? error.message : String(error))
        return 1
      }

      /*
       * Secrets are reported as present/absent only. An operator running this
       * over a shared terminal or pasting output into an issue must not leak
       * AUTH_SECRET.
       */
      const secretKeys = new Set([
        'AUTH_SECRET',
        'TICK_SECRET',
        'DATABASE_URL',
        'DIRECT_DATABASE_URL',
        'MAIL_HTTP_TOKEN',
        'REDIS_URL',
        'S3_SECRET_ACCESS_KEY',
      ])

      const rows = Object.entries(env)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, secretKeys.has(k) ? '<set>' : String(v)] as const)
        .sort(([a], [b]) => a.localeCompare(b))

      const width = Math.max(...rows.map(([k]) => k.length))
      for (const [k, v] of rows) console.log(`${k.padEnd(width)}  ${v}`)

      console.log('\nEnvironment is valid.')
      console.log(
        envFiles.loaded.length > 0
          ? `Loaded ${envFiles.loaded.join(', ')} from ${envFiles.root}.`
          : envFiles.root === undefined
            ? 'No workspace root found — configuration came from the environment.'
            : `No .env files at ${envFiles.root} — configuration came from the environment.`,
      )
      if (env.DATA_SOURCE === 'fixture') {
        console.log(
          'DATA_SOURCE=fixture — in-memory sample data. Set DATABASE_URL for Postgres.',
        )
      }
      return 0
    },
  },

  {
    name: 'migrate',
    summary: 'Apply pending database migrations.',
    async run() {
      const { assertEnv } = await import('@meith/core')
      const env = assertEnv()

      if (env.DATA_SOURCE !== 'postgres') {
        console.error(
          'Nothing to migrate: DATA_SOURCE is "fixture". Set DATABASE_URL first.',
        )
        return 1
      }

      const { runMigrations } = await import('@meith/db')
      const applied = await runMigrations()
      console.log(
        applied === 0
          ? 'Already up to date.'
          : `Applied ${applied} migration(s).`,
      )
      return 0
    },
  },

  {
    name: 'import',
    summary: 'Import a MyBB board. Resumable — run it again to continue.',
    usage:
      'MYBB_PASSWORD=… forum import --host H --user U --database D ' +
      '[--prefix mybb_] [--port 3306] [--charset utf8mb4] [--ssl] ' +
      '[--budget 20000] [--page-size 200]',
    async run(args: readonly string[]) {
      const { assertEnv } = await import('@meith/core')
      const env = assertEnv()

      if (env.DATA_SOURCE !== 'postgres') {
        console.error('Nothing to import into: DATA_SOURCE is "fixture". Set DATABASE_URL first.')
        return 1
      }

      return importCommand(args)
    },
  },

  {
    name: 'upgrade',
    summary: 'Apply core and plugin migrations, then record the version.',
    usage: 'forum upgrade [--dry-run]',
    async run(args: readonly string[]) {
      const { assertEnv } = await import('@meith/core')
      const env = assertEnv()

      if (env.DATA_SOURCE !== 'postgres') {
        console.error('Nothing to upgrade: DATA_SOURCE is "fixture". Set DATABASE_URL first.')
        return 1
      }

      const { upgrade } = await import('./upgrade')
      return upgrade({
        dryRun: args.includes('--dry-run'),
        /*
         * Empty, and honestly so: `forum.config.ts` lives in the board's project
         * and an operator CLI installed from npm has no path to it. Plugin
         * migrations are applied by the board's own upgrade entry point; this
         * command handles core, which is what an operator at a terminal has.
         */
        plugins: [],
        log: (line) => console.log(line),
      })
    },
  },

  {
    name: 'settings:list',
    summary: 'Print the setting registry with default values.',
    async run() {
      /*
       * Reads the *registry*, not resolved values. Resolved values need a
       * SettingsRepository, which belongs to the composition root (still
       * pending — see `tick` and `queue:drain` below). Listing defaults is
       * genuinely useful on its own: it is how an operator discovers what keys
       * exist and what they may be set to.
       */
      const { SETTING_DEFINITIONS } = await import('@meith/settings')

      const width = Math.max(...SETTING_DEFINITIONS.map((d) => d.key.length))
      let group = ''

      for (const d of SETTING_DEFINITIONS) {
        if (d.group !== group) {
          group = d.group
          console.log(`\n[${group}]`)
        }
        console.log(`  ${d.key.padEnd(width)}  ${JSON.stringify(d.default)}`)
      }
      console.log()
      return 0
    },
  },

  {
    name: 'user:create',
    summary: 'Create a user account. Pipe the password in on stdin.',
    usage:
      'echo "<password>" | forum user:create --username <name> --email <addr> [--group <key>]',
    run: userCreate,
  },

  {
    name: 'user:promote',
    summary: "Change a user's primary group.",
    usage: 'forum user:promote --user <id|username> --group <key|id>',
    run: userPromote,
  },

  {
    name: 'forum:create',
    summary: 'Create a category, forum or link.',
    usage:
      'forum forum:create --title <title> --slug <slug> [--parent <id>] ' +
      '[--type category|forum|link] [--description <text>] [--link-url <url>]',
    run: forumCreate,
  },

  {
    name: 'settings:get',
    summary: 'Print one resolved setting value.',
    usage: 'forum settings:get <key>',
    run: settingsGet,
  },

  {
    name: 'settings:set',
    summary: 'Set one setting, validated by the registry.',
    usage: 'forum settings:set <key> <value>',
    run: settingsSet,
  },

  {
    name: 'profile-field:list',
    summary: 'List the custom profile fields this board defines.',
    run: profileFieldList,
  },

  {
    name: 'profile-field:add',
    summary: 'Define a custom profile field.',
    usage:
      'forum profile-field:add --key <key> --label <label> ' +
      '--type text|textarea|select|checkbox|url|number ' +
      '[--options a,b,c] [--required] [--postbit] [--order <n>]',
    run: profileFieldAdd,
  },

  {
    name: 'profile-field:remove',
    summary: "Delete a custom profile field and every member's answer to it.",
    usage: 'forum profile-field:remove <key>',
    run: profileFieldRemove,
  },

  {
    name: 'task:list',
    summary: 'List the scheduled tasks this build registers.',
    run: taskList,
  },

  {
    name: 'task:run',
    summary: 'Run every task that is due now, or one named task if it is due.',
    usage: 'forum task:run [<task-id>]',
    run: taskRun,
  },

  {
    name: 'search:reindex',
    summary: 'Build the full-text index for posts that have none. Resumable.',
    run: searchReindex,
  },
]


/*
 * `task:run` and `task:list` arrived once F06 gave the scheduler a real
 * `TaskRepository`; `queue:drain` is not separate from them, because draining
 * the queue *is* one of the registered tasks and running it twice by two routes
 * would mean two claims on the same work.
 *
 * Still deliberately absent: `cache:clear`. It needs a cache an operator could
 * meaningfully clear, and there is not one — MemoryCache dies with the process
 * it lives in, and NextCache's `revalidateTag` only works inside a Next
 * request. The honest implementation bumps `cache_versions`, and that belongs
 * with F70's Recount & Rebuild.
 *
 * Registering it now as a command that throws would be worse than omitting it:
 * `forum --help` would advertise a capability the binary does not have.
 */

/**
 * What `loadEnvFiles()` found, so `env:check` can report it.
 *
 * Assigned by `main()` before any command runs. `env:check` exists to answer
 * "what configuration am I actually running with", and the file that supplied it
 * is half that answer — an operator staring at `DATA_SOURCE fixture` needs to
 * know whether the CLI read their `.env` and it said fixture, or never found it.
 */
let envFiles: LoadedEnvFiles = { root: undefined, loaded: [] }

async function main(): Promise<number> {
  /*
   * First, before a command can import anything that reads `env`. The CLI is a
   * plain Node process: unlike `next dev`, nothing has populated `process.env`
   * from the workspace's `.env` by the time it starts.
   */
  envFiles = loadEnvFiles()

  const [name, ...rest] = process.argv.slice(2)

  if (!name || name === '--help' || name === '-h') {
    console.log(usage(commands))
    return name ? 0 : 1
  }

  const command = commands.find((c) => c.name === name)
  if (!command) {
    console.error(`Unknown command: ${name}\n`)
    console.error(usage(commands))
    return 1
  }

  if (rest.includes('--help')) {
    console.log(command.usage ?? `forum ${command.name}`)
    return 0
  }

  return command.run(rest)
}

main()
  .then((code) => process.exit(code))
  .catch(async (error: unknown) => {
    /*
     * Expected failures print their message and nothing else. A missing --title
     * or an unset DATABASE_URL is an operator mistake, not a defect, and a stack
     * trace buries the one line that says how to fix it — it also trains people
     * to ignore stack traces, so the real ones stop being read.
     *
     * Anything unrecognised still prints in full, because that IS a defect.
     */
    const { isAppError } = await import('@meith/core')

    if (isAppError(error)) {
      console.error(error.message)
    } else {
      console.error(error instanceof Error ? error.stack : String(error))
    }
    process.exit(1)
  })
