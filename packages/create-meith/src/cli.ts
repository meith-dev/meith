/**
 * F82 — `npx create-meith my-board`.
 *
 * Everything interesting is in `scaffold.ts`, which is a pure function from
 * options to a map of files. This is the part that parses argv, refuses to
 * destroy anything, and writes.
 *
 * The split is not ceremony: a generator's behaviour *is* its output, and a
 * generator that can only be inspected by running it and looking at a directory
 * is one whose output nobody asserts. Here the output is a value.
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { DEFAULT_REPOSITORY_URL, nextSteps, scaffold, validateName } from './scaffold'

export interface CliResult {
  readonly code: number
  readonly lines: readonly string[]
}

/**
 * Would writing here destroy somebody's work?
 *
 * A directory that exists and is empty is fine — `mkdir my-board && cd ..` is
 * how half of people start. One with anything in it is refused, including dot
 * files: a scaffold that overwrote a `.git` directory or an existing `.env`
 * would be the single worst thing this tool could do, and "it asked me" is not a
 * defence when the prompt was a `-y` away.
 */
async function isSafeTarget(target: string): Promise<boolean> {
  try {
    return (await readdir(target)).length === 0
  } catch {
    /* Does not exist: safe, and `mkdir -p` will create it. */
    return true
  }
}

export async function run(argv: readonly string[], version: string): Promise<CliResult> {
  const positional = argv.filter((arg) => !arg.startsWith('-'))
  const name = positional[0] ?? ''

  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      code: 0,
      lines: [
        'create-meith — scaffold a forum project.',
        '',
        '  npx create-meith <name> [--repo <url>]',
        '',
        'Writes package.json, community.config.ts, .env.example, .gitignore and',
        'README.md into ./<name>, then tells you what to run.',
      ],
    }
  }

  const invalid = validateName(name)
  if (invalid !== null) {
    return { code: 1, lines: [`create-meith: ${invalid}`, '', 'Usage: npx create-meith <name>'] }
  }

  const repoIndex = argv.indexOf('--repo')
  const repositoryUrl =
    repoIndex === -1 ? DEFAULT_REPOSITORY_URL : (argv[repoIndex + 1] ?? DEFAULT_REPOSITORY_URL)

  const target = resolve(process.cwd(), name)
  if (!(await isSafeTarget(target))) {
    return {
      code: 1,
      lines: [
        `create-meith: ${name} already exists and is not empty.`,
        'Refusing to write into it — pick another name, or empty it first.',
      ],
    }
  }

  const files = scaffold({ name, version, repositoryUrl })
  for (const [relative, contents] of files) {
    const path = join(target, relative)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents, 'utf8')
  }

  return {
    code: 0,
    lines: [
      `Created ${name} — ${files.size} files.`,
      '',
      ...nextSteps(name).map((step) => `  ${step}`),
      '',
      'Then set DATABASE_URL, AUTH_SECRET and TICK_SECRET and deploy.',
      'Something must run the tick every minute — the worker process, or',
      '`community task:run`. Without it nothing catches up, and nothing errors.',
    ],
  }
}
