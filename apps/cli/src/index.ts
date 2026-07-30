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
      const { assertEnv } = await import('@forum/core')

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
      const { assertEnv } = await import('@forum/core')
      const env = assertEnv()

      if (env.DATA_SOURCE !== 'postgres') {
        console.error(
          'Nothing to migrate: DATA_SOURCE is "fixture". Set DATABASE_URL first.',
        )
        return 1
      }

      const { runMigrations } = await import('@forum/db')
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
      const { SETTING_DEFINITIONS } = await import('@forum/settings')

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
]

/*
 * Deliberately absent: `tick`, `queue:drain` and `settings:get`.
 *
 * Each needs a repository implementation wired to either Postgres or the
 * fixture — the composition root, which does not exist yet. `tick()`,
 * `relayOutbox()` and `SettingsSnapshot.fromOverrides()` all take their
 * repository as a parameter precisely so they stay testable, which means
 * something has to construct it.
 *
 * Registering them now as commands that throw at runtime would be worse than
 * omitting them: `forum --help` would advertise capabilities the binary does not
 * have. They are added in the same change that introduces the composition root.
 */

async function main(): Promise<number> {
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
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exit(1)
  })
