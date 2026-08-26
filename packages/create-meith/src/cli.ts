import { execFile } from 'node:child_process'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { DEFAULT_REPOSITORY_URL, nextSteps, scaffold, validateName } from './scaffold'
import {
  type ExtensionKind,
  extensionNextSteps,
  scaffoldExtension,
  validateExtensionName,
} from './scaffold-extension'

const execFileAsync = promisify(execFile)

export interface CliResult {
  readonly code: number
  readonly lines: readonly string[]
}

async function isSafeTarget(target: string): Promise<boolean> {
  try {
    return (await readdir(target)).length === 0
  } catch {
    return true
  }
}

async function initGit(target: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: target })
    await execFileAsync('git', ['add', '-A'], { cwd: target })
    return true
  } catch {
    return false
  }
}

export async function run(argv: readonly string[], version: string): Promise<CliResult> {
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === '--repo') {
      i++
      continue
    }
    if (!arg.startsWith('-')) positional.push(arg)
  }
  const name = positional[0] ?? ''

  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      code: 0,
      lines: [
        'create-meith — scaffold a forum project, a plugin or a theme.',
        '',
        '  npx create-meith <name> [--repo <url>] [--no-git]',
        '  npx create-meith --plugin <name> [--repo <url>] [--no-git]',
        '  npx create-meith --theme <name> [--repo <url>] [--no-git]',
        '',
        'The first form writes a deployable board into ./<name>, then tells you',
        'what to run. --plugin and --theme write an extension workspace instead:',
        'source and a passing test copied from the meith repository’s worked',
        'examples, plus a README and a marketplace listing.json.',
        '',
        '--no-git skips initializing a git repository in the new directory.',
      ],
    }
  }

  const wantsPlugin = argv.includes('--plugin')
  const wantsTheme = argv.includes('--theme')
  if (wantsPlugin && wantsTheme) {
    return {
      code: 1,
      lines: ['create-meith: --plugin and --theme are two different scaffolds — pass one.'],
    }
  }
  const kind: ExtensionKind | null = wantsPlugin ? 'plugin' : wantsTheme ? 'theme' : null
  const usage =
    kind === null ? 'Usage: npx create-meith <name>' : `Usage: npx create-meith --${kind} <name>`

  const invalid = kind === null ? validateName(name) : validateExtensionName(name)
  if (invalid !== null) {
    return { code: 1, lines: [`create-meith: ${invalid}`, '', usage] }
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

  const files =
    kind === null
      ? scaffold({ name, version, repositoryUrl })
      : scaffoldExtension(kind, {
          name,
          version,
          repositoryUrl: repoIndex === -1 ? undefined : repositoryUrl,
        })
  for (const [relative, contents] of files) {
    const path = join(target, relative)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents, 'utf8')
  }

  const gitReady = argv.includes('--no-git') ? false : await initGit(target)

  return {
    code: 0,
    lines: [
      `Created ${name} — ${files.size} files.`,
      '',
      ...(kind === null ? nextSteps(name) : extensionNextSteps(name)).map((step) => `  ${step}`),
      '',
      ...(gitReady
        ? [
            'Initialized a git repository here and staged every file. Commit it,',
            'add a GitHub remote and push:',
            '',
            `  git commit -m "Scaffold ${name}"`,
            `  git remote add origin https://github.com/<you>/${name}.git`,
            '  git push -u origin main',
          ]
        : [
            'Push it to a new, empty repository on GitHub:',
            '',
            `  cd ${name}`,
            `  git init && git add -A && git commit -m "Scaffold ${name}"`,
            `  git remote add origin https://github.com/<you>/${name}.git`,
            '  git push -u origin main',
          ]),
      '',
      ...(kind === null
        ? [
            'Then set DATABASE_URL, AUTH_SECRET and TICK_SECRET and deploy.',
            'Something must run the tick every minute — the worker process, or',
            '`community task:run`. Without it nothing catches up, and nothing errors.',
          ]
        : [
            `Then follow README.md — it walks through running the ${kind} inside a`,
            'scaffolded board and submitting it to the meith.dev marketplace.',
          ]),
    ],
  }
}
