#!/usr/bin/env node
import process from 'node:process'

import { type LoadedEnvFiles, loadEnvFiles } from '@meith/core/env-files'

import { backupCommand, backupFetchCommand, backupListCommand, restoreCommand } from './backup'
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
    'meith — operator CLI',
    '',
    'Usage: meith <command> [options]',
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
    usage: [
      'meith migrate',
      '',
      'Applies every migration this release has that the board has not, then exits.',
      'Safe to run concurrently: the runner holds a Postgres advisory lock for the',
      'whole run, so a second deploy waits for the first and then finds nothing to do.',
      '',
      'Migrates over DIRECT_DATABASE_URL when it is set, and over DATABASE_URL when it',
      'is not. On a managed database point DIRECT_DATABASE_URL at the direct',
      '(non-pooler) connection string: a transaction-mode pooler hands the connection',
      'back as soon as the lock statement ends, so the lock is left on a backend that',
      'goes to somebody else and the run is no longer serialised against other runs.',
    ].join('\n'),
    async run() {
      const { assertEnv } = await import('@meith/core')
      const env = assertEnv()

      if (env.DATA_SOURCE !== 'postgres') {
        console.error('Nothing to migrate: DATA_SOURCE is "fixture". Set DATABASE_URL first.')
        return 1
      }

      console.log(
        env.DIRECT_DATABASE_URL === undefined
          ? 'Migrating over DATABASE_URL…'
          : 'Migrating over DIRECT_DATABASE_URL…',
      )

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
    usage: 'meith upgrade [--dry-run]',
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
    usage: [
      'meith backup [--out <path> | --dir <dir>] [--keep <n>] [--uploads include|skip]',
      '',
      '--dir writes a timestamped bundle into a directory and, after a successful',
      'write, prunes bundles there beyond the newest --keep (7 unless set).',
      'With BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID and',
      'BACKUP_S3_SECRET_ACCESS_KEY set (BACKUP_S3_ENDPOINT and BACKUP_S3_PREFIX',
      'optional), every bundle is also shipped to that S3-compatible destination',
      'and pruned there to the same --keep.',
    ].join('\n'),
    run: backupCommand,
  },

  {
    name: 'backup:list',
    summary: 'List the backup bundles on local disk and at the off-site destination.',
    usage: [
      'meith backup:list [--dir <dir>]',
      '',
      '--dir defaults to BACKUP_DIR, the ring the admin panel and the scheduler use',
      '(/backups in the shipped image).',
    ].join('\n'),
    run: backupListCommand,
  },

  {
    name: 'backup:fetch',
    summary: 'Download one bundle from the off-site destination (BACKUP_S3_*).',
    usage: 'meith backup:fetch <meith-backup-….tar.gz> [--out <path>]',
    run: backupFetchCommand,
  },

  {
    name: 'restore',
    summary: 'Restore a backup bundle into a new, empty database.',
    usage:
      'RESTORE_DATABASE_URL=<postgres://…> meith restore <bundle.tar.gz> ' +
      '[--uploads-dir <dir>] [--skip-uploads]',
    run: restoreCommand,
  },

  {
    name: 'plugin:purge',
    summary: 'Run a plugin’s onUninstall and remove its data. Do this before removing the code.',
    usage: 'meith plugin:purge <key> [--yes]',
    async run(args: readonly string[]) {
      const { assertEnv } = await import('@meith/core')
      const env = assertEnv()

      if (env.DATA_SOURCE !== 'postgres') {
        console.error('Nothing to purge: DATA_SOURCE is "fixture". Set DATABASE_URL first.')
        return 1
      }

      const key = args.find((arg) => !arg.startsWith('--'))
      if (key === undefined) {
        console.error('Usage: meith plugin:purge <key> [--yes]')
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
    name: 'plugin:add',
    summary: 'Install a plugin, add it to board.plugins.json, and regenerate meith.plugins.ts.',
    usage: 'meith plugin:add <package> [--key <key>] [--disabled]',
    async run(args: readonly string[]) {
      const { pluginAdd } = await import('./plugin-manifest')
      return pluginAdd(args)
    },
  },

  {
    name: 'plugin:remove',
    summary: 'Remove a plugin from board.plugins.json and regenerate meith.plugins.ts.',
    usage: 'meith plugin:remove <key>',
    async run(args: readonly string[]) {
      const { pluginRemove } = await import('./plugin-manifest')
      return pluginRemove(args)
    },
  },

  {
    name: 'board:eject',
    summary:
      'Write this build as a standalone workspace — the first step of graduating off the stock image.',
    usage: 'meith board:eject <dir>',
    async run(args: readonly string[]) {
      const { boardEject } = await import('./board-eject')
      return boardEject(args)
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
    usage: 'echo "<password>" | meith user:create --username <name> --email <addr> [--group <key>]',
    run: userCreate,
  },

  {
    name: 'user:promote',
    summary: "Change a user's primary group.",
    usage: 'meith user:promote --user <id|username> --group <key|id>',
    run: userPromote,
  },

  {
    name: 'user:2fa-clear',
    summary: "Clear a user's second factor when they have lost it, and sign them out.",
    usage: 'meith user:2fa-clear --user <id|username>',
    run: userClearSecondFactor,
  },

  {
    name: 'forum:create',
    summary: 'Create a category, forum or link.',
    usage:
      'meith forum:create --title <title> --slug <slug> [--parent <id>] ' +
      '[--type category|forum|link] [--description <text>] [--link-url <url>]',
    run: forumCreate,
  },

  {
    name: 'settings:get',
    summary: 'Print one resolved setting value.',
    usage: 'meith settings:get <key>',
    run: settingsGet,
  },

  {
    name: 'settings:set',
    summary: 'Set one setting, validated by the registry.',
    usage:
      'meith settings:set <key> <value>\n' +
      'meith settings:set <secret-key> --from-env <name>\n' +
      'printf %s "$SECRET" | meith settings:set <secret-key>',
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
      'meith profile-field:add --key <key> --label <label> ' +
      '--type text|textarea|select|checkbox|url|number ' +
      '[--options a,b,c] [--required] [--postbit] [--order <n>]',
    run: profileFieldAdd,
  },

  {
    name: 'profile-field:remove',
    summary: "Delete a custom profile field and every member's answer to it.",
    usage: 'meith profile-field:remove <key>',
    run: profileFieldRemove,
  },

  {
    name: 'push:keys',
    summary: 'Generate a VAPID key pair for web push. --save writes it to the board.',
    usage: 'meith push:keys [--save]',
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
    usage: 'meith task:run [<task-id>]',
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
    usage: 'meith demo:reset --yes',
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
    console.log(command.usage ?? `meith ${command.name}`)
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
