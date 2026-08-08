import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { run } from './cli'
import { DEFAULT_REPOSITORY_URL, nextSteps, scaffold, validateName } from './scaffold'

const OPTIONS = { name: 'my-board', version: '1.2.3', repositoryUrl: DEFAULT_REPOSITORY_URL }

describe('the project name', () => {
  it('accepts an npm-shaped name', () => {
    expect(validateName('my-board')).toBeNull()
    expect(validateName('forum.example')).toBeNull()
    expect(validateName('board_2')).toBeNull()
  })

  /*
   * `.` and `..` are the two that matter, and they are checked before the
   * pattern gets a chance: a project called `..` scaffolds into the *parent*
   * directory, which is the one failure of a generator that deleting a folder
   * does not undo.
   */
  it.each(['', '.', '..', 'My-Board', 'a/b', 'a\\b', '-leading'])(
    'refuses %o',
    (name) => {
      expect(validateName(name)).not.toBeNull()
    },
  )
})

describe('what the scaffold writes', () => {
  const files = scaffold(OPTIONS)

  it('writes the five files a deployable project needs', () => {
    expect([...files.keys()].sort()).toEqual([
      '.env.example',
      '.gitignore',
      'README.md',
      'community.config.ts',
      'package.json',
    ])
  })

  /*
   * There was a sixth, and its absence is the point. `vercel.json` carried the
   * tick cron for a platform this project no longer deploys to, and a scaffold
   * that ships a schedule for a host that cannot run a process outliving a
   * request is describing a board that half works.
   */
  it('ships no platform configuration file', () => {
    expect([...files.keys()]).not.toContain('vercel.json')
  })

  it('names the project and pins the dependency versions', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(manifest.name).toBe('my-board')
    expect(manifest.dependencies['@meith/web']).toBe('1.2.3')
    expect(manifest.dependencies['@meith/theme-default']).toBe('1.2.3')
  })

  it('gives the project the three scripts an operator needs', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(Object.keys(manifest.scripts).sort()).toEqual(['build', 'community', 'dev', 'start'])
  })

  /*
   * Every catch-up operation runs on the tick, and when it does not run
   * *nothing fails* — the work simply does not happen until somebody notices a
   * ban that should have ended last month (F70). The scaffold cannot schedule
   * it, so the one thing it can do is make sure the reader is told what runs
   * it, in the file they open first.
   */
  it('tells the reader which process runs the tick', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(/tick/i)
    expect(readme).toMatch(/worker/i)
    expect(readme).toMatch(/task:run/)
  })

  it('names every required secret in the env template, with no value', () => {
    const env = files.get('.env.example')!
    for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'TICK_SECRET']) {
      expect(env).toMatch(new RegExp(`^${key}=$`, 'm'))
    }
  })

  /*
   * The one operational mistake that looks like a database problem and is not:
   * against a managed database on its direct connection string a board works in
   * testing and starts refusing connections under the first real traffic. It is
   * a warning rather than an instruction now, because a board on its own
   * Postgres — the documented route — does not need a pooler at all.
   */
  it('warns about the pooler where somebody choosing a managed database will read it', () => {
    expect(files.get('.env.example')).toMatch(/POOLER/)
  })

  /*
   * Run the documented command rather than reading it.
   *
   * The first version of this test evaluated the snippet inside the test's own
   * ESM scope and failed with "require is not defined" — which is true there and
   * false in `node -e`, where the default scope is CommonJS. Evaluating it
   * somewhere it does not run is not a test of anything, so the command is
   * spawned exactly as an operator would type it.
   */
  it('generates a working secret-generation command', async () => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')

    const command = /node -e "(.+)"/.exec(files.get('.env.example')!)?.[1]
    expect(command).toBeDefined()

    const { stdout } = await promisify(execFile)(process.execPath, ['-e', command!])
    expect(stdout.trim().length).toBeGreaterThan(30)
  })

  /*
   * A board is meant to be forked, and the generated README sends the reader to
   * the self-hosting guide — which has to be *their* copy of it, or a fork with
   * a changed compose file documents somebody else's.
   */
  it('points the generated README at the repository it was told about', () => {
    const readme = scaffold({ ...OPTIONS, repositoryUrl: 'https://example.test/board' }).get(
      'README.md',
    )!
    expect(readme).toContain('https://example.test/board/blob/main/docs/self-hosting.md')
  })

  /* The routes that were removed stay removed. */
  it('offers no serverless platform', () => {
    for (const file of files.values()) {
      expect(file).not.toMatch(/vercel\.com\/new\/clone/)
      expect(file).not.toMatch(/deploy\.workers\.cloudflare\.com/)
    }
  })

  /* A scaffold that leaked `.env` into git would be the worst kind of default. */
  it('ignores the environment files and the build output', () => {
    const ignore = files.get('.gitignore')!
    for (const entry of ['node_modules', '.next', '.env', '.env.local']) {
      expect(ignore.split('\n')).toContain(entry)
    }
  })

  it('produces the same tree twice', () => {
    expect([...scaffold(OPTIONS)]).toEqual([...scaffold(OPTIONS)])
  })

  it('tells the operator what to run, in order', () => {
    expect(nextSteps('my-board')[0]).toBe('cd my-board')
    expect(nextSteps('my-board')).toContain('npm install')
  })
})

describe('the CLI', () => {
  async function inTemp<T>(body: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'create-meith-'))
    const previous = process.cwd()
    process.chdir(dir)
    try {
      return await body(dir)
    } finally {
      process.chdir(previous)
    }
  }

  it('prints usage and succeeds for --help', async () => {
    const result = await run(['--help'], '1.0.0')
    expect(result.code).toBe(0)
    expect(result.lines.join('\n')).toContain('npx create-meith')
  })

  it('fails with a message when the name is missing', async () => {
    const result = await run([], '1.0.0')
    expect(result.code).toBe(1)
    expect(result.lines[0]).toMatch(/project name is required/)
  })

  it('writes the tree into a new directory', async () => {
    await inTemp(async (dir) => {
      const result = await run(['my-board'], '1.2.3')
      expect(result.code).toBe(0)

      const written = await readdir(join(dir, 'my-board'))
      expect(written.sort()).toEqual([
        '.env.example',
        '.gitignore',
        'README.md',
        'community.config.ts',
        'package.json',
      ])

      const manifest = JSON.parse(await readFile(join(dir, 'my-board/package.json'), 'utf8'))
      expect(manifest.name).toBe('my-board')
    })
  })

  it('scaffolds into an existing empty directory', async () => {
    await inTemp(async (dir) => {
      await writeFile(join(dir, 'placeholder'), '')
      const result = await run(['fresh'], '1.0.0')
      expect(result.code).toBe(0)
    })
  })

  /*
   * The refusal that matters. Overwriting somebody's `.git` or their existing
   * `.env` is the single worst thing this tool could do, and "it asked first" is
   * no defence when the prompt is one flag away from being skipped.
   */
  it('refuses a directory that is not empty', async () => {
    await inTemp(async (dir) => {
      await run(['my-board'], '1.0.0')
      const second = await run(['my-board'], '1.0.0')

      expect(second.code).toBe(1)
      expect(second.lines.join('\n')).toMatch(/already exists and is not empty/)

      /* And it changed nothing: the first tree is still the first tree. */
      const manifest = JSON.parse(await readFile(join(dir, 'my-board/package.json'), 'utf8'))
      expect(manifest.name).toBe('my-board')
    })
  })

  it('accepts a repository override, so a fork documents itself', async () => {
    await inTemp(async (dir) => {
      await run(['my-board', '--repo', 'https://example.test/fork'], '1.0.0')
      const readme = await readFile(join(dir, 'my-board/README.md'), 'utf8')
      expect(readme).toContain('https://example.test/fork')
    })
  })
})
