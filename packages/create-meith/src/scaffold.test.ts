import { readFileSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { run } from './cli'
import {
  DEFAULT_REPOSITORY_URL,
  DEFAULT_TEMPLATE_REPOSITORY_URL,
  deployButtonUrl,
  MATERIALIZED_AT_ROOT,
  MATERIALIZED_PUBLIC,
  NEXT_VERSION,
  nextSteps,
  RESEND_SENDER_MAILBOX,
  scaffold,
  validateName,
} from './scaffold'

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
      '.github/dependabot.yml',
      '.github/workflows/build.yml',
      '.gitignore',
      '.npmrc',
      'Dockerfile',
      'README.md',
      'board.plugins.json',
      'docker-compose.yaml',
      'docker-entrypoint.sh',
      'docker-healthcheck.sh',
      'meith.config.ts',
      'meith.plugins.ts',
      'package.json',
    ])
  })

  it('keeps this board’s own GitHub Actions current, without touching the coupled Meith pins', () => {
    const dependabot = files.get('.github/dependabot.yml')!

    expect(dependabot).toContain('package-ecosystem: github-actions')
    expect(dependabot).not.toContain('package-ecosystem: npm')
  })

  it('ships no platform configuration file', () => {
    expect([...files.keys()]).not.toContain('vercel.json')
  })

  it('registers the theme catalog, without which the board renders its message keys', () => {
    const config = files.get('meith.config.ts')!

    expect(config).toMatch(/messages:\s*defaultMessages/)
    expect(config).toMatch(/\bdefaultMessages\b[\s\S]*from '@meith\/theme-default'/)
  })

  it('registers every field of the theme entry that boards/stock registers, as a set rather than a checklist', () => {
    const stock = readFileSync(
      join(import.meta.dirname, '../../../boards/stock/meith.config.ts'),
      'utf8',
    )

    expect(themeEntryFields(files.get('meith.config.ts')!)).toEqual(themeEntryFields(stock))
  })

  it('names the project and pins the dependency versions', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(manifest.name).toBe('my-board')
    expect(manifest.dependencies['@meith/web']).toBe('1.2.3')
    expect(manifest.dependencies['@meith/theme-default']).toBe('1.2.3')
  })

  it('declares next itself, at the version @meith/web builds with', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(manifest.dependencies.next).toBe(NEXT_VERSION)
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
    expect(readme).toContain(
      'https://example.test/board/blob/main/docs/getting-started/deployment/docker-compose.md',
    )
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

  it("keeps a board's own top-level directories in the image and in git", () => {
    const dockerignore = files.get('.dockerignore')!.split('\n')
    const gitignore = files.get('.gitignore')!.split('\n')

    for (const entry of MATERIALIZED_AT_ROOT) {
      expect(dockerignore).not.toContain(`/${entry}`)
      expect(gitignore).not.toContain(`/${entry}`)
    }
    for (const entry of ['src', 'public']) {
      expect(dockerignore).not.toContain(entry)
      expect(gitignore).not.toContain(entry)
    }
  })

  it('produces the same tree twice', () => {
    expect([...scaffold(OPTIONS)]).toEqual([...scaffold(OPTIONS)])
  })

  it('tells the operator what to run, in order', () => {
    expect(nextSteps('my-board')[0]).toBe('cd my-board')
    expect(nextSteps('my-board')).toContain('npm install')
  })

  it('does not send the operator through an env file to reach a first run', () => {
    expect(nextSteps('my-board')).toEqual(['cd my-board', 'npm install', 'npm run dev'])
  })

  it('ships an .env.example that cannot defeat the fixture-mode derivation', () => {
    const example = scaffold(OPTIONS).get('.env.example')!
    const assignment = example.split('\n').find((line) => /^\s*DATA_SOURCE\s*=/.test(line))

    expect(assignment).toBeUndefined()
  })

  it('gives the generated README the same first run the CLI prints', () => {
    const readme = scaffold(OPTIONS).get('README.md')!
    const local = readme.slice(readme.indexOf('## Local'))
    const block = local.slice(
      local.indexOf('```sh') + 5,
      local.indexOf('```', local.indexOf('```sh') + 5),
    )

    expect(
      block
        .trim()
        .split('\n')
        .map((line) => line.trim()),
    ).toEqual(nextSteps('my-board').filter((step) => !step.startsWith('cd ')))
  })
})

describe('the deploy kit — every file complete for someone with a GitHub account and a Coolify server', () => {
  const files = scaffold(OPTIONS)
  const dockerfile = files.get('Dockerfile')!
  const buildWorkflow = files.get('.github/workflows/build.yml')!
  const compose = files.get('docker-compose.yaml')!
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

  it('re-pins next from the package just installed, never from a number typed by hand', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(
      /npm install --save-exact @meith\/web@latest @meith\/cli@latest @meith\/theme-default@latest/,
    )
    expect(readme).toMatch(/build argument/i)
    expect(readme).toContain(
      'npm install --save-exact next@$(node -p ' +
        '"require(\'./node_modules/@meith/web/package.json\').dependencies.next")',
    )
    expect(readme).not.toMatch(/next@\d/)
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
        'docker-compose.yaml',
        'docker-entrypoint.sh',
        'docker-healthcheck.sh',
        'meith.config.ts',
        'meith.plugins.ts',
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

const SELF_HOST_TREE_DIGESTS: Readonly<Record<string, string>> = {
  'package.json': 'fbe57f89349df4dee13155fdbe939e57ef35a551291762776be18d9acb6ab4b3',
  '.npmrc': 'b147ab9c34152b7b2b4c8464680b4f3ed5e8dbfa35edfdfa7114fd8ac9e61121',
  'meith.config.ts': 'df13fc2f73d0d69c05bf75cf8ddfca4640a616731979c7fc51a97f3a6c0d4dee',
  'board.plugins.json': '5775237a361a9183f19cef427633bade5d3d96b4b219e5fc455a304e70319320',
  'meith.plugins.ts': 'ec19e2e919d67d790aaf90809215909a78ef28b22e76a5bc8ff4b297932c4975',
  '.env.example': '83defc2c09c20a47010594dd89a2d602311e05179d756759aeac699302d170bb',
  '.gitignore': '4df33d67d3f6cab040df85bda5505ff64431892d3207eb2ea07a571a8386a0dc',
  Dockerfile: '97522eb00e3cb3e3c77a7813e720570aad694e0cafb3908fe1736fb0728e7b7b',
  'docker-entrypoint.sh': 'cd1ef4a68be0005b31cbdb21bcd460035a157668550dbe3fca23cfd6d48321a0',
  'docker-healthcheck.sh': '2fcb2391ab88d9787ee4b90f9c69595419a67a22e9582d448cd6b6f0c5b59bd7',
  '.dockerignore': '620ca0bdf50f76e3817c135ee43afe56669b7b3caaad86b4926021cc52dd3c4b',
  '.github/dependabot.yml': '6cae93a9aa7b08a6f62e94db7c940d74b3657ff81454e6dc6b6e485b1afa3ac8',
  '.github/workflows/build.yml': 'd61b4b1fe933e5fd4d584e63ec45a999e47145529c0c89f9bb9eef0580fb4915',
  'docker-compose.yaml': 'bb57c62317b1db6572a553f578bc2f603fa63cc69bc45d4ffdf938e044f19960',
  'README.md': 'c2af780df2ca761943117adbe44c4ce464bb6781654dcb9928b78d21066221d4',
}

const VERCEL_OPTIONS = { ...OPTIONS, target: 'vercel' } as const

function themeEntryFields(config: string): string[] {
  const start = config.indexOf('default: {')
  if (start === -1) return []

  const fields: string[] = []
  let depth = 0

  for (let at = config.indexOf('{', start); at < config.length; at += 1) {
    const char = config[at]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) break
    } else if (depth === 1) {
      const field = /^([A-Za-z][A-Za-z0-9]*):/.exec(config.slice(at))
      if (field?.[1] !== undefined && !/[A-Za-z0-9]/.test(config[at - 1] ?? '')) {
        fields.push(field[1])
      }
    }
  }

  return fields.sort()
}

describe('the default target, against the tree it produced before a second target existed', () => {
  it('is byte-identical file by file — a name that fails here is the file that drifted', async () => {
    const { createHash } = await import('node:crypto')

    const digests = Object.fromEntries(
      [...scaffold(OPTIONS)].map(([path, content]) => [
        path,
        createHash('sha256').update(content).digest('hex'),
      ]),
    )

    expect(digests).toEqual(SELF_HOST_TREE_DIGESTS)
  })

  it('is what an absent target means, so every existing caller keeps its output', () => {
    expect([...scaffold({ ...OPTIONS, target: 'self-host' })]).toEqual([...scaffold(OPTIONS)])
  })
})

describe('the Vercel target', () => {
  const files = scaffold(VERCEL_OPTIONS)

  it('writes the board, its platform configuration, and nothing that builds a container', () => {
    expect([...files.keys()].sort()).toEqual([
      '.env.example',
      '.gitignore',
      '.npmrc',
      'README.md',
      'board.plugins.json',
      'meith.config.ts',
      'meith.plugins.ts',
      'package.json',
      'vercel.json',
    ])
  })

  it('leaves the board itself identical to the self-host tree, byte for byte', () => {
    const selfHost = scaffold(OPTIONS)
    for (const path of ['.npmrc', 'meith.config.ts', 'meith.plugins.ts']) {
      expect(files.get(path)).toBe(selfHost.get(path))
    }
  })

  it('differs from the self-host manifest in the materialization flag and nothing else', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    const selfHost = JSON.parse(scaffold(OPTIONS).get('package.json')!)

    expect(manifest.dependencies).toEqual(selfHost.dependencies)
    expect(manifest.scripts).toEqual({
      dev: 'forum-web dev --at-root',
      build: 'forum-web build --at-root',
      start: 'forum-web start --at-root',
      community: 'community',
    })
  })

  it('materializes at the board root in every script, so local and deployed agree', () => {
    const { scripts } = JSON.parse(files.get('package.json')!)
    for (const command of ['dev', 'build', 'start']) {
      expect(scripts[command]).toContain('--at-root')
    }
  })

  it('ignores every name that materialization writes into the board root', () => {
    const gitignore = files.get('.gitignore')!.split('\n')
    for (const entry of MATERIALIZED_AT_ROOT) {
      if (entry === 'public') continue
      expect(gitignore).toContain(`/${entry}`)
    }
  })

  it('ignores public file by file, so a board can keep its own files there', () => {
    const gitignore = files.get('.gitignore')!.split('\n')

    expect(gitignore).not.toContain('/public')
    for (const file of MATERIALIZED_PUBLIC) {
      expect(gitignore).toContain(`/public/${file}`)
    }
    expect(gitignore).not.toContain('/public/ads.txt')
  })

  it('parses as JSON and carries the cron path and the build command', () => {
    const config = JSON.parse(files.get('vercel.json')!)

    expect(config.buildCommand).toBe('community migrate && forum-web build --at-root')
    expect(config.crons).toEqual([{ path: '/api/system/tick', schedule: '0 3 * * *' }])
  })

  it('schedules the tick no more than daily, which is all a Hobby plan deploys', () => {
    const config = JSON.parse(files.get('vercel.json')!)
    const [minute, hour] = config.crons[0].schedule.split(' ')

    expect(minute).not.toBe('*')
    expect(hour).not.toBe('*')
  })

  it('applies the schema before it builds, in one command', () => {
    const { buildCommand } = JSON.parse(files.get('vercel.json')!)
    expect(buildCommand.indexOf('community migrate')).toBeLessThan(
      buildCommand.indexOf('forum-web build'),
    )
  })

  it('both names the framework and declares next, because the preset needs each', () => {
    const manifest = JSON.parse(files.get('package.json')!)
    expect(manifest.dependencies.next).toBe(NEXT_VERSION)
    expect(JSON.parse(files.get('vercel.json')!).framework).toBe('nextjs')
  })

  it('names every variable the canonical serverless set needs', () => {
    const env = files.get('.env.example')!
    for (const key of [
      'DATABASE_URL',
      'DIRECT_DATABASE_URL',
      'REDIS_URL',
      'AUTH_SECRET',
      'CRON_SECRET',
      'BLOB_READ_WRITE_TOKEN',
      'MAIL_FROM',
      'RESEND_API_KEY',
      'APP_URL',
    ]) {
      expect(env).toMatch(new RegExp(`^${key}=$`, 'm'))
    }
  })

  it('fixes the five drivers rather than leaving them to be chosen', () => {
    const env = files.get('.env.example')!
    for (const line of [
      'DATA_SOURCE=postgres',
      'QUEUE_DRIVER=postgres',
      'CACHE_DRIVER=redis',
      'FILESTORE_DRIVER=blob',
      'MAIL_DRIVER=http',
    ]) {
      expect(env).toMatch(new RegExp(`^${line}$`, 'm'))
    }
  })

  it('keeps the portable bucket documented, commented out, beside the blob store', () => {
    const env = files.get('.env.example')!
    for (const key of [
      'S3_BUCKET',
      'S3_REGION',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_ENDPOINT',
      'S3_PUBLIC_BASE_URL',
    ]) {
      expect(env).toMatch(new RegExp(`^# ${key}=$`, 'm'))
    }
  })

  it('offers the generic mail pair commented out, under the injected key', () => {
    const env = files.get('.env.example')!
    expect(env).toMatch(/^# MAIL_HTTP_ENDPOINT=$/m)
    expect(env).toMatch(/^# MAIL_HTTP_TOKEN=$/m)
  })

  it('makes the direct URL required here, where the self-host template offers it', () => {
    expect(files.get('.env.example')).toMatch(/^DIRECT_DATABASE_URL=$/m)
    expect(scaffold(OPTIONS).get('.env.example')).toMatch(/^# DIRECT_DATABASE_URL=$/m)
  })

  it('extends the guidance the self-host template already carries rather than restating it', () => {
    const selfHost = scaffold(OPTIONS).get('.env.example')!
    const vercel = files.get('.env.example')!
    const shared = 'If it is a managed database that offers a TRANSACTION-MODE POOLER string'

    expect(selfHost).toContain(shared)
    expect(vercel).toContain(shared)
  })

  it('leaves no SMTP guidance behind, on a platform that blocks the plain SMTP port', () => {
    expect(files.get('.env.example')).not.toContain('MAIL_SMTP_PORT=465')
  })

  it('ignores the platform CLI directory as well as the build output', () => {
    expect(files.get('.gitignore')!.split('\n')).toContain('.vercel')
  })

  it('leads the README with a Deploy Button pointing at the template repository', () => {
    const readme = files.get('README.md')!
    expect(readme).toContain('https://vercel.com/new/clone?')
    expect(readme).toContain(encodeURIComponent(DEFAULT_TEMPLATE_REPOSITORY_URL))
  })

  it('asks the marketplace for the database, the cache, the object store and mail', () => {
    const url = new URL(deployButtonUrl(DEFAULT_TEMPLATE_REPOSITORY_URL))
    const products = JSON.parse(url.searchParams.get('products') ?? '[]')

    expect(products).toEqual([
      { type: 'integration', integrationSlug: 'neon', productSlug: 'neon', protocol: 'storage' },
      {
        type: 'integration',
        integrationSlug: 'upstash',
        productSlug: 'upstash-kv',
        protocol: 'storage',
      },
      { type: 'blob' },
      {
        type: 'integration',
        integrationSlug: 'resend',
        productSlug: 'resend-email',
        protocol: 'messaging',
      },
    ])
    expect(url.searchParams.get('repository-url')).toBe(DEFAULT_TEMPLATE_REPOSITORY_URL)
  })

  it('carries every product in one parameter, and not the undocumented one', () => {
    const url = new URL(deployButtonUrl(DEFAULT_TEMPLATE_REPOSITORY_URL))
    expect(url.searchParams.get('stores')).toBeNull()
  })

  it('provisions mail with the deploy, and leaves nothing after it', () => {
    const readme = files.get('README.md')!

    expect(readme).toContain('## Mail')
    expect(readme).toContain('RESEND_API_KEY')
    expect(readme).toContain('RESEND_EMAIL_DOMAIN')
    expect(readme).toMatch(/Mail needs no variables after the deploy/)
    expect(readme).not.toMatch(/Mail is the one thing the button does not set up/)
    expect(readme).not.toContain('## Mail, after the deploy')
  })

  it('prompts for the two values nothing else can supply, and for nothing else', () => {
    const url = new URL(deployButtonUrl(DEFAULT_TEMPLATE_REPOSITORY_URL))
    const prompted = url.searchParams.get('env')?.split(',') ?? []

    expect(prompted).toEqual(['AUTH_SECRET', 'CRON_SECRET'])

    for (const published of [
      'DATABASE_URL',
      'BLOB_READ_WRITE_TOKEN',
      'RESEND_API_KEY',
      'MAIL_HTTP_ENDPOINT',
      'MAIL_HTTP_TOKEN',
      'S3_BUCKET',
      'DATA_SOURCE',
      'QUEUE_DRIVER',
      'MAIL_DRIVER',
    ]) {
      expect(prompted).not.toContain(published)
    }
  })

  it('no longer asks for the four values the linked stores already answer', () => {
    const url = new URL(deployButtonUrl(DEFAULT_TEMPLATE_REPOSITORY_URL))
    const prompted = url.searchParams.get('env')?.split(',') ?? []

    for (const derived of [
      'CACHE_DRIVER',
      'FILESTORE_DRIVER',
      'DIRECT_DATABASE_URL',
      'REDIS_URL',
    ]) {
      expect(prompted).not.toContain(derived)
    }
  })

  it('asks for no sender address, because the linked Resend already answers it', () => {
    const url = new URL(deployButtonUrl(DEFAULT_TEMPLATE_REPOSITORY_URL))
    const readme = files.get('README.md')!

    expect(url.searchParams.get('env')?.split(',') ?? []).not.toContain('MAIL_FROM')
    expect(url.searchParams.get('envDescription')).not.toContain('address')
    expect(readme).not.toMatch(/Add `MAIL_FROM` to the project's environment settings/)
    expect(readme).toMatch(/To send from a different address/)
  })

  it('names the mailbox the board derives, so the README cannot claim another', () => {
    const readme = files.get('README.md')!

    expect(readme).toContain(`${RESEND_SENDER_MAILBOX}@`)
  })

  it('says where each derived value comes from, so a failed derivation is findable', () => {
    const readme = files.get('README.md')!

    expect(readme).toContain('DATABASE_URL_UNPOOLED')
    expect(readme).toContain('POSTGRES_URL_NON_POOLING')
    expect(readme).toContain('KV_URL')
    expect(readme).toMatch(/refuses to boot rather than guess/)
  })

  it('tells the operator how to carry the uploads out, because nothing else will', () => {
    const readme = files.get('README.md')!

    expect(readme).toContain('## Leaving Vercel')
    expect(readme).toContain('community -- backup')
    expect(readme).toContain('BLOB_READ_WRITE_TOKEN')
    expect(readme).toMatch(/\*\*by\s+default\*\*/)
  })

  it('points the button at a fork when the scaffold is told about one', () => {
    const readme = scaffold({
      ...VERCEL_OPTIONS,
      templateRepositoryUrl: 'https://example.test/template',
    }).get('README.md')!

    expect(readme).toContain(encodeURIComponent('https://example.test/template'))
    expect(readme).not.toContain(encodeURIComponent(DEFAULT_TEMPLATE_REPOSITORY_URL))
  })

  it('tells the reader that /install creates the board and its first administrator', () => {
    const readme = files.get('README.md')!
    expect(readme).toContain('/install')
    expect(readme).toMatch(/first administrator/)
    expect(readme).toMatch(/404/)
  })

  it('generates both secrets the way the documentation does', () => {
    const readme = files.get('README.md')!
    expect((readme.match(/openssl rand -hex 32/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(readme).toMatch(/AUTH_SECRET/)
    expect(readme).toMatch(/CRON_SECRET/)
  })

  it('warns that a per-minute schedule needs a paid plan, before the operator deploys', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(/paid plan/)
    expect(readme).toMatch(/once a day/)
    expect(readme).toMatch(/TICK_SECRET/)
  })

  it('warns that maxDuration is checked at build time, so Hobby fails rather than clamps', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(/maxDuration = 300/)
    expect(readme).toMatch(/when the project builds, not when the\n {2}function runs/)
    expect(readme).toMatch(/Fluid Compute/)
    expect(readme).toMatch(/fails the\n {2}deployment/)
  })

  it('tells no Coolify or GHCR story, which would contradict the one it does tell', () => {
    const readme = files.get('README.md')!
    expect(readme).not.toMatch(/coolify/i)
    expect(readme).not.toMatch(/ghcr\.io/)
  })

  it('produces the same tree twice', () => {
    expect([...scaffold(VERCEL_OPTIONS)]).toEqual([...scaffold(VERCEL_OPTIONS)])
  })
})

describe('the sender the Resend bridge derives', () => {
  function mailboxInCore(): string {
    const core = readFileSync(join(import.meta.dirname, '../../core/src/env.ts'), 'utf8')
    return /RESEND_SENDER_MAILBOX = '([^']+)'/.exec(core)?.[1] ?? ''
  }

  it('finds the constant it is holding the template to', () => {
    expect(mailboxInCore()).not.toBe('')
  })

  it('says the same mailbox the board actually sends from', () => {
    expect(RESEND_SENDER_MAILBOX).toBe(mailboxInCore())
  })
})
