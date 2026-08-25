import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

  it.each(['', '.', '..', 'My-Board', 'a/b', 'a\\b', '-leading'])('refuses %o', (name) => {
    expect(validateName(name)).not.toBeNull()
  })
})

describe('what the scaffold writes', () => {
  const files = scaffold(OPTIONS)

  it('writes the files a deployable project needs, including the deploy kit', () => {
    expect([...files.keys()].sort()).toEqual([
      '.dockerignore',
      '.env.example',
      '.github/workflows/build.yml',
      '.gitignore',
      '.npmrc',
      'Dockerfile',
      'README.md',
      'board.plugins.json',
      'community.config.ts',
      'community.plugins.ts',
      'docker-compose.yml',
      'docker-entrypoint.sh',
      'docker-healthcheck.sh',
      'package.json',
    ])
  })

  it('ships no platform configuration file', () => {
    expect([...files.keys()]).not.toContain('vercel.json')
  })

  it('names the project and pins the dependency versions', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(manifest.name).toBe('my-board')
    expect(manifest.dependencies['@meith/web']).toBe('1.2.3')
    expect(manifest.dependencies['@meith/theme-default']).toBe('1.2.3')
  })

  it("ships an .npmrc that keeps every install here exact, not only the scaffold's own pins", () => {
    expect(files.get('.npmrc')).toMatch(/^save-exact=true$/m)
  })

  it('gives the project the three scripts an operator needs', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(Object.keys(manifest.scripts).sort()).toEqual(['build', 'community', 'dev', 'start'])
  })

  it('tells the reader which process runs the tick', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(/tick/i)
    expect(readme).toMatch(/worker/i)
    expect(readme).toMatch(/task:run/)
  })

  it('only documents operator commands through the script the scaffold actually defines', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    const readme = files.get('README.md')!
    expect(readme).not.toContain('npm run forum')
    expect((readme.match(/npm run community --/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(manifest.scripts.community).toBeDefined()
  })

  it('names every required secret in the env template, with no value', () => {
    const env = files.get('.env.example')!
    for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'TICK_SECRET']) {
      expect(env).toMatch(new RegExp(`^${key}=$`, 'm'))
    }
  })

  it('warns about the pooler where somebody choosing a managed database will read it', () => {
    expect(files.get('.env.example')).toMatch(/POOLER/)
  })

  it('offers the direct URL beside it, commented out, as the one migrations take', () => {
    const env = files.get('.env.example')!

    expect(env).toMatch(/^# DIRECT_DATABASE_URL=$/m)
    expect(env.indexOf('DIRECT_DATABASE_URL')).toBeGreaterThan(env.indexOf('DATABASE_URL='))
    expect(env).toMatch(/community migrate/)
    expect(env).toMatch(/advisory lock/)
  })

  it('generates a working secret-generation command', async () => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')

    const command = /node -e "(.+)"/.exec(files.get('.env.example')!)?.[1]
    expect(command).toBeDefined()

    const { stdout } = await promisify(execFile)(process.execPath, ['-e', command!])
    expect(stdout.trim().length).toBeGreaterThan(30)
  })

  it('points the generated README at the repository it was told about', () => {
    const readme = scaffold({ ...OPTIONS, repositoryUrl: 'https://example.test/board' }).get(
      'README.md',
    )!
    expect(readme).toContain('https://example.test/board/blob/main/docs/self-hosting.md')
  })

  it('offers no serverless platform', () => {
    for (const file of files.values()) {
      expect(file).not.toMatch(/vercel\.com\/new\/clone/)
      expect(file).not.toMatch(/deploy\.workers\.cloudflare\.com/)
    }
  })

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

/**
 * MEI-77: the deploy kit — a scaffolded board must work for someone with
 * nothing but a GitHub account and a Coolify server, with every file
 * complete and no placeholder needing hand-finishing except the board name
 * (already templated above).
 */
describe('the deploy kit', () => {
  const files = scaffold(OPTIONS)
  const dockerfile = files.get('Dockerfile')!
  const buildWorkflow = files.get('.github/workflows/build.yml')!
  const compose = files.get('docker-compose.yml')!
  const entrypoint = files.get('docker-entrypoint.sh')!
  const healthcheck = files.get('docker-healthcheck.sh')!
  const dockerignore = files.get('.dockerignore')!

  it("starts the board's image FROM the published base image, pinned by a build arg rather than a literal version", () => {
    expect(dockerfile).toContain('ARG MEITH_VERSION')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Dockerfile ARG syntax, not a template-string typo
    expect(dockerfile).toContain('FROM ghcr.io/meith-dev/meith-base:${MEITH_VERSION} AS deps')
    expect(dockerfile).not.toContain('meith-base:1.2.3')
  })

  it("reads that build arg from package.json's own @meith/web dependency, so upgrading is one file", () => {
    expect(buildWorkflow).toContain(
      "MEITH_VERSION=$(node -p \"require('./package.json').dependencies['@meith/web']\")",
    )
    expect(buildWorkflow).toContain('--build-arg MEITH_VERSION="$MEITH_VERSION"')
  })

  it('installs only its own delta on top of the base image', () => {
    expect(dockerfile).toContain('COPY package.json ./')
    expect(dockerfile).toContain('RUN npm install')
    expect(dockerfile).not.toContain('pnpm install')
  })

  it('builds the board, not just installs it', () => {
    expect(dockerfile).toContain('npx forum-web build')
  })

  /** See docs/self-hosting.md for why this Dockerfile scopes DATA_SOURCE to the RUN command. */
  it('scopes the build-time DATA_SOURCE to the build command, not a persistent ENV', () => {
    expect(dockerfile).toContain('RUN DATA_SOURCE=fixture npx forum-web build')
    expect(dockerfile).not.toMatch(/^ENV DATA_SOURCE=/m)
  })

  it('carries no board secret or database URL', () => {
    for (const file of [dockerfile, buildWorkflow]) {
      expect(file).not.toMatch(/AUTH_SECRET=\S/)
      expect(file).not.toContain('DATABASE_URL=postgres')
    }
  })

  it('drops root privilege before running', () => {
    expect(dockerfile).toContain('USER node')
  })

  it('declares a healthcheck and an entrypoint, both made executable', () => {
    expect(dockerfile).toContain('RUN chmod +x docker-entrypoint.sh docker-healthcheck.sh')
    expect(dockerfile).toContain('HEALTHCHECK')
    expect(dockerfile).toContain('ENTRYPOINT ["./docker-entrypoint.sh"]')
  })

  it('ignores what a local checkout has that the image build must not see', () => {
    for (const entry of ['node_modules', '.env', '.git']) {
      expect(dockerignore.split('\n')).toContain(entry)
    }
  })

  it('the entrypoint runs the web role by default and migrate on request, and refuses anything else', () => {
    expect(entrypoint).toContain('node_modules/.bin/forum-web start')
    expect(entrypoint).toContain('node_modules/.bin/community migrate')
    expect(entrypoint).toMatch(/COMMUNITY_ROLE:-web/)
    expect(entrypoint).toContain('exit 1')
  })

  it('the healthcheck has no opinion while migrate runs', () => {
    expect(healthcheck).toMatch(/COMMUNITY_ROLE:-web.*=.*migrate/)
    expect(healthcheck).toContain('exit 0')
  })

  it("pushes to the operator's own GHCR with only the automatic GITHUB_TOKEN — no secret to configure", () => {
    expect(buildWorkflow).toContain('on:')
    expect(buildWorkflow).toMatch(/push:\s*\n\s*branches: \[main\]/)
    expect(buildWorkflow).toContain('packages: write')
    expect(buildWorkflow).toContain('registry: ghcr.io')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax, not a template-string typo
    expect(buildWorkflow).toContain('password: ${{ secrets.GITHUB_TOKEN }}')
    expect(buildWorkflow).not.toMatch(/secrets\.(?!GITHUB_TOKEN)[A-Z_]+/)
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax, not a template-string typo
    expect(buildWorkflow).toContain('ghcr.io/${{ github.repository }}')
  })

  it('offers no paid CI or registry', () => {
    for (const file of [buildWorkflow, compose]) {
      expect(file).not.toMatch(/hub\.docker\.com/)
      expect(file).not.toMatch(/circleci|travis-ci|buildkite/i)
    }
  })

  it('runs the whole board, mirroring the meith repository’s own Coolify compose shape', () => {
    for (const service of ['postgres', 'migrate', 'web', 'worker']) {
      expect(compose).toMatch(new RegExp(`\\n {2}${service}:\\n`))
    }
  })

  it('asks the operator for nothing except the image it cannot generate itself', () => {
    expect(compose).toContain('AUTH_SECRET: $SERVICE_BASE64_64_AUTH')
    expect(compose).toContain('TICK_SECRET: $SERVICE_BASE64_64_TICK')
    expect(compose).toContain('$SERVICE_PASSWORD_POSTGRES')
    expect(compose).not.toMatch(/AUTH_SECRET=\$\{[^}]*:-/)
  })

  it('refuses to start without an image, loudly, rather than pulling something unpinned', () => {
    expect(compose).toMatch(/image: \$\{MEITH_IMAGE:\?/)
    expect(compose).not.toMatch(/image: \$\{MEITH_IMAGE:-/)
  })

  it('publishes no ports, leaving the proxy in front', () => {
    expect(compose).not.toMatch(/^\s*ports:/m)
  })

  it('drives the tick without a compiled worker binary', () => {
    expect(compose).toMatch(/system\/tick/)
    expect(compose).toContain('Authorization: Bearer')
  })

  it("prints the image to deploy and a link to the package's visibility toggle in the run's own Summary", () => {
    expect(buildWorkflow).toContain('GITHUB_STEP_SUMMARY')
    expect(buildWorkflow).toMatch(/\$IMAGE:latest/)
    expect(buildWorkflow).toMatch(/pkgs\/container/)
  })

  it('leads the Summary with the sha tag, not the floating latest one', () => {
    const summaryStep = buildWorkflow.slice(buildWorkflow.indexOf('name: Summary'))
    const shaIndex = summaryStep.indexOf('github.sha')
    const latestIndex = summaryStep.indexOf('$IMAGE:latest')
    expect(shaIndex).toBeGreaterThan(-1)
    expect(latestIndex).toBeGreaterThan(-1)
    expect(shaIndex).toBeLessThan(latestIndex)
  })

  it('mounts the uploads volume into both processes that write to it', () => {
    expect(compose).toMatch(/uploads:\/app\/\.uploads/g)
    expect([...compose.matchAll(/uploads:\/app\/\.uploads/g)]).toHaveLength(1)
  })

  it('tells the three-step deploy story, and the local alternative', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(/push this repository to github/i)
    expect(readme).toMatch(/github actions/i)
    expect(readme).toMatch(/coolify/i)
    expect(readme).toContain('MEITH_IMAGE')
    expect(readme).toContain('docker build --build-arg MEITH_VERSION=')
    expect(readme).toMatch(/-t my-board \.\s*```/)
  })

  it('leads the README deploy step with the sha tag, not the floating latest one', () => {
    const readme = files.get('README.md')!
    const shaIndex = readme.indexOf('github.sha')
    const latestIndex = readme.indexOf(':latest')
    expect(shaIndex).toBeGreaterThan(-1)
    expect(latestIndex).toBeGreaterThan(-1)
    expect(shaIndex).toBeLessThan(latestIndex)
  })

  it('tells the operator upgrading is one package.json edit, not a second pin to keep in sync', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(
      /npm install --save-exact @meith\/web@latest @meith\/cli@latest @meith\/theme-default@latest/,
    )
    expect(readme).toMatch(/build argument/i)
    expect(readme).not.toMatch(/bump/i)
  })

  it('documents --save-exact, so the upgrade it tells the operator to run never writes a caret range', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(/--save-exact/)
    expect(readme).toMatch(/not a legal Docker image tag|invalid reference format/)
  })

  it('refuses to build from anything but an exact @meith/web version, not only a documented --save-exact', () => {
    expect(buildWorkflow).toContain(
      'if ! echo "$MEITH_VERSION" | grep -Eq \'^[0-9]+\\.[0-9]+\\.[0-9]+$\'; then',
    )
    expect(buildWorkflow).toMatch(/::error::.*not an exact X\.Y\.Z version/)
    expect(buildWorkflow.indexOf('grep -Eq')).toBeLessThan(
      buildWorkflow.indexOf('docker build --build-arg MEITH_VERSION'),
    )
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
      const result = await run(['my-board', '--no-git'], '1.2.3')
      expect(result.code).toBe(0)

      const written = await readdir(join(dir, 'my-board'))
      expect(written.sort()).toEqual([
        '.dockerignore',
        '.env.example',
        '.github',
        '.gitignore',
        '.npmrc',
        'Dockerfile',
        'README.md',
        'board.plugins.json',
        'community.config.ts',
        'community.plugins.ts',
        'docker-compose.yml',
        'docker-entrypoint.sh',
        'docker-healthcheck.sh',
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

  it('refuses a directory that is not empty', async () => {
    await inTemp(async (dir) => {
      await run(['my-board'], '1.0.0')
      const second = await run(['my-board'], '1.0.0')

      expect(second.code).toBe(1)
      expect(second.lines.join('\n')).toMatch(/already exists and is not empty/)

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

  it('accepts --repo before the name too, rather than mistaking the URL for it', async () => {
    await inTemp(async (dir) => {
      const result = await run(['--repo', 'https://example.test/fork', 'my-board'], '1.0.0')
      expect(result.code).toBe(0)

      const readme = await readFile(join(dir, 'my-board/README.md'), 'utf8')
      expect(readme).toContain('https://example.test/fork')
    })
  })

  it('initializes a git repository and stages every file, so pushing is the only step left', async () => {
    await inTemp(async (dir) => {
      const result = await run(['my-board'], '1.0.0')
      expect(result.lines.join('\n')).toContain('Initialized a git repository')

      const top = await readdir(join(dir, 'my-board'))
      expect(top).toContain('.git')

      const head = await readFile(join(dir, 'my-board/.git/HEAD'), 'utf8')
      expect(head.trim()).toBe('ref: refs/heads/main')

      const gitDir = await readdir(join(dir, 'my-board/.git'))
      expect(gitDir).toContain('index')
    })
  })

  it('--no-git skips the repository and prints the full manual sequence instead', async () => {
    await inTemp(async (dir) => {
      const result = await run(['my-board', '--no-git'], '1.0.0')
      const output = result.lines.join('\n')
      expect(output).not.toContain('Initialized a git repository')
      expect(output).toContain('git init && git add -A && git commit')

      const top = await readdir(join(dir, 'my-board'))
      expect(top).not.toContain('.git')
    })
  })
})

describe('the published bin, run the way npx actually runs it', () => {
  it('executes under plain node with no TypeScript loader', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'create-meith-bin-'))
    try {
      const esbuild = await import('esbuild')
      const bundlePath = join(dir, 'bin.mjs')
      await esbuild.build({
        entryPoints: [fileURLToPath(new URL('./bin.ts', import.meta.url))],
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
        outfile: bundlePath,
      })

      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [bundlePath, 'plain-node-board'],
        {
          cwd: dir,
        },
      )

      expect(stdout).toContain('Created plain-node-board')
      const manifest = JSON.parse(
        await readFile(join(dir, 'plain-node-board/package.json'), 'utf8'),
      )
      expect(manifest.name).toBe('plain-node-board')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
