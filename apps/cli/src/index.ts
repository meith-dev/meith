#!/usr/bin/env node
import process from 'node:process'

import { type LoadedEnvFiles, loadEnvFiles } from '@meith/core/env-files'

import { backupCommand, restoreCommand } from './backup'
import {
  forumCreate,
  settingDisplayValue,
  settingsGet,
  settingsSet,
  userClearSecondFactor,
  userCreate,
  userPromote,
} from './commands'
import { demoReset, demoSeed } from './demo'
import { importCommand } from './import'
import { profileFieldAdd, profileFieldList, profileFieldRemove } from './profile-fields'
import { pushKeys } from './push'
import { SECRET_ENV_KEYS } from './redaction'
import { searchReindex } from './search'
import { taskList, taskRun } from './tasks'

interface Command {
  readonly name: string
  readonly summary: string
  readonly usage?: string
  run(args: readonly string[]): Promise<number>
}

function usage(commands: readonly Command[]): string {
  const width = Math.max(...commands.map((c) => c.name.length))
  const lines = commands.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`)
  return [
    'community — operator CLI',
    '',
    'Usage: community <command> [options]',
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
      const { assertEnv } = await import('@meith/core')

      let env: ReturnType<typeof assertEnv>
      try {
        env = assertEnv()
      } catch (error) {
        console.error('Environment is invalid:\n')
        console.error(error instanceof Error ? error.message : String(error))
        return 1
      }

      const rows = Object.entries(env)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, SECRET_ENV_KEYS.has(k) ? '<set>' : String(v)] as const)
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
        console.log('DATA_SOURCE=fixture — in-memory sample data. Set DATABASE_URL for Postgres.')
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
        console.error('Nothing to migrate: DATA_SOURCE is "fixture". Set DATABASE_URL first.')
        return 1
      }

      const { runMigrations } = await import('@meith/db')
      const applied = await runMigrations()
      console.log(applied === 0 ? 'Already up to date.' : `Applied ${applied} migration(s).`)
      return 0
    },
  },

  {
    name: 'import',
    summary: 'Import a MyBB or phpBB board. Resumable — run it again to continue.',
    usage:
      'IMPORT_SOURCE_PASSWORD=… forum import --host H --user U --database D ' +
      '[--source mybb|phpbb] [--prefix mybb_] [--uploads-dir /path/to/uploads] ' +
      '[--port 3306] [--charset utf8mb4] [--ssl] ' +
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
    usage: 'community upgrade [--dry-run]',
    async run(args: readonly string[]) {
      const { assertEnv } = await import('@meith/core')
      const env = assertEnv()

      if (env.DATA_SOURCE !== 'postgres') {
        console.error('Nothing to upgrade: DATA_SOURCE is "fixture". Set DATABASE_URL first.')
        return 1
      }

      const { upgrade } = await import('./upgrade')
      const { installedPluginDefinitions } = await import('@board/plugins')
      return upgrade({
        dryRun: args.includes('--dry-run'),
        plugins: installedPluginDefinitions(),
        log: (line) => console.log(line),
      })
    },
  },

  {
    name: 'backup',
    summary: 'Dump the database and the uploads into one restorable bundle.',
    usage: 'community backup [--out <path>] [--uploads include|skip]',
    run: backupCommand,
  },

  {
    name: 'restore',
    summary: 'Restore a backup bundle into a new, empty database.',
    usage:
      'RESTORE_DATABASE_URL=<postgres://…> community restore <bundle.tar.gz> ' +
      '[--uploads-dir <dir>] [--skip-uploads]',
    run: restoreCommand,
  },

  {
    name: 'plugin:purge',
    summary: 'Run a plugin’s onUninstall and remove its data. Do this before removing the code.',
    usage: 'community plugin:purge <key> [--yes]',
    async run(args: readonly string[]) {
      const { assertEnv } = await import('@meith/core')
      const env = assertEnv()

      if (env.DATA_SOURCE !== 'postgres') {
        console.error('Nothing to purge: DATA_SOURCE is "fixture". Set DATABASE_URL first.')
        return 1
      }

      const key = args.find((arg) => !arg.startsWith('--'))
      if (key === undefined) {
        console.error('Usage: community plugin:purge <key> [--yes]')
        return 1
      }

      const { purge } = await import('./plugins')
      const { installedPluginDefinitions } = await import('@board/plugins')
      return purge({
        key,
        plugins: installedPluginDefinitions(),
        confirmed: args.includes('--yes'),
        log: (line) => console.log(line),
      })
    },
  },

  {
    name: 'settings:list',
    summary: 'Print the setting registry with default values.',
    async run() {
      const { SETTING_DEFINITIONS } = await import('@meith/settings')

      const width = Math.max(...SETTING_DEFINITIONS.map((d) => d.key.length))
      let group = ''

      for (const d of SETTING_DEFINITIONS) {
        if (d.group !== group) {
          group = d.group
          console.log(`\n[${group}]`)
        }
        console.log(`  ${d.key.padEnd(width)}  ${settingDisplayValue(d, d.default)}`)
      }
      console.log()
      return 0
    },
  },

  {
    name: 'user:create',
    summary: 'Create a user account. Pipe the password in on stdin.',
    usage:
      'echo "<password>" | community user:create --username <name> --email <addr> [--group <key>]',
    run: userCreate,
  },

  {
    name: 'user:promote',
    summary: "Change a user's primary group.",
    usage: 'community user:promote --user <id|username> --group <key|id>',
    run: userPromote,
  },

  {
    name: 'user:2fa-clear',
    summary: "Clear a user's second factor when they have lost it, and sign them out.",
    usage: 'community user:2fa-clear --user <id|username>',
    run: userClearSecondFactor,
  },

  {
    name: 'forum:create',
    summary: 'Create a category, forum or link.',
    usage:
      'community forum:create --title <title> --slug <slug> [--parent <id>] ' +
      '[--type category|forum|link] [--description <text>] [--link-url <url>]',
    run: forumCreate,
  },

  {
    name: 'settings:get',
    summary: 'Print one resolved setting value.',
    usage: 'community settings:get <key>',
    run: settingsGet,
  },

  {
    name: 'settings:set',
    summary: 'Set one setting, validated by the registry.',
    usage:
      'community settings:set <key> <value>\n' +
      'community settings:set <secret-key> --from-env <name>\n' +
      'printf %s "$SECRET" | community settings:set <secret-key>',
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
      'community profile-field:add --key <key> --label <label> ' +
      '--type text|textarea|select|checkbox|url|number ' +
      '[--options a,b,c] [--required] [--postbit] [--order <n>]',
    run: profileFieldAdd,
  },

  {
    name: 'profile-field:remove',
    summary: "Delete a custom profile field and every member's answer to it.",
    usage: 'community profile-field:remove <key>',
    run: profileFieldRemove,
  },

  {
    name: 'push:keys',
    summary: 'Generate a VAPID key pair for web push. --save writes it to the board.',
    usage: 'community push:keys [--save]',
    run: pushKeys,
  },

  {
    name: 'task:list',
    summary: 'List the scheduled tasks this build registers.',
    run: taskList,
  },

  {
    name: 'task:run',
    summary: 'Run every task that is due now, or one named task if it is due.',
    usage: 'community task:run [<task-id>]',
    run: taskRun,
  },

  {
    name: 'search:reindex',
    summary: 'Build the full-text index for posts that have none. Resumable.',
    run: searchReindex,
  },

  {
    name: 'demo:seed',
    summary: 'Write the demo board into an empty database. Needs DEMO_MODE.',
    run: demoSeed,
  },

  {
    name: 'demo:reset',
    summary: 'Drop everything and rebuild the demo board. Needs DEMO_MODE.',
    usage: 'community demo:reset --yes',
    run: demoReset,
  },
]

let envFiles: LoadedEnvFiles = { root: undefined, loaded: [] }

async function main(): Promise<number> {
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
    console.log(command.usage ?? `community ${command.name}`)
    return 0
  }

  return command.run(rest)
}

main()
  .then((code) => process.exit(code))
  .catch(async (error: unknown) => {
    const { isAppError } = await import('@meith/core')

    if (isAppError(error)) {
      console.error(error.message)
    } else {
      console.error(error instanceof Error ? error.stack : String(error))
    }
    process.exit(1)
  })
