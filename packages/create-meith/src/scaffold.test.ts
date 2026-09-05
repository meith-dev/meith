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
      '.github/workflows/update.yml',
      '.gitignore',
      '.npmrc',
      'Dockerfile',
      'Dockerfile.prebuilt',
      'README.md',
      'board.plugins.json',
      'docker-compose.byhand.yaml',
      'docker-compose.prebuilt.yaml',
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
    expect(Object.keys(manifest.scripts).sort()).toEqual(['build', 'dev', 'meith', 'start'])
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
    expect((readme.match(/npm run meith --/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(manifest.scripts.meith).toBeDefined()
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
    expect(env).toMatch(/meith migrate/)
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
  const dockerfilePrebuilt = files.get('Dockerfile.prebuilt')!
  const buildWorkflow = files.get('.github/workflows/build.yml')!
  const compose = files.get('docker-compose.yaml')!
  const composePrebuilt = files.get('docker-compose.prebuilt.yaml')!
  const entrypoint = files.get('docker-entrypoint.sh')!
  const healthcheck = files.get('docker-healthcheck.sh')!
  const dockerignore = files.get('.dockerignore')!

  it('builds the quick-start image FROM a plain node:alpine, with no version to pin', () => {
    expect(dockerfile).toMatch(/^FROM node:26-alpine@sha256:[0-9a-f]+ AS deps$/m)
    expect(dockerfile).not.toContain('ARG MEITH_VERSION')
    expect(dockerfile).not.toContain('meith-base')
  })

  it('starts the prebuilt image FROM the published base image, pinned by a build arg rather than a literal version', () => {
    expect(dockerfilePrebuilt).toContain('ARG MEITH_VERSION')
    expect(dockerfilePrebuilt).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Dockerfile ARG syntax, not a template-string typo
      'FROM ghcr.io/meith-dev/meith-base:${MEITH_VERSION} AS deps',
    )
    expect(dockerfilePrebuilt).not.toContain('meith-base:1.2.3')
  })

  it("puts the board's own meith CLI on PATH in both images, targeting /board", () => {
    for (const image of [dockerfile, dockerfilePrebuilt]) {
      expect(image).toContain('/usr/local/bin/meith')
      expect(image).toContain('cd /board')
      expect(image).toContain('exec node_modules/.bin/meith "$@"')
    }
  })

  it('writes uploads to the volume mount path in both images, so a redeploy keeps them', () => {
    for (const image of [dockerfile, dockerfilePrebuilt]) {
      expect(image).toContain('ENV UPLOADS_DIR=/app/.uploads')
      expect(image).toContain('mkdir -p /app/.uploads && chown node:node /app/.uploads')
    }
    expect(compose).toContain('uploads:/app/.uploads')
    expect(composePrebuilt).toContain('uploads:/app/.uploads')
  })

  it('gives the backup ring a volume of its own and passes the off-site destination through, on both paths', () => {
    for (const file of [compose, composePrebuilt]) {
      expect(file).toContain('backups:/backups')
      expect(file).toMatch(/volumes:\n(.*\n)*\s{2}backups:/)
      for (const variable of [
        'BACKUP_S3_BUCKET',
        'BACKUP_S3_REGION',
        'BACKUP_S3_ACCESS_KEY_ID',
        'BACKUP_S3_SECRET_ACCESS_KEY',
        'BACKUP_S3_ENDPOINT',
        'BACKUP_S3_PREFIX',
      ]) {
        expect(file).toContain(`${variable}=\${${variable}:-}`)
      }
    }
  })

  it("reads that build arg from package.json's own @meith/web dependency, so upgrading is one file", () => {
    expect(buildWorkflow).toContain(
      "MEITH_VERSION=$(node -p \"require('./package.json').dependencies['@meith/web']\")",
    )
    expect(buildWorkflow).toContain(
      'docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION="$MEITH_VERSION"',
    )
  })

  it('installs its dependency closure the same way in both images', () => {
    for (const image of [dockerfile, dockerfilePrebuilt]) {
      expect(image).toContain('COPY package.json ./')
      expect(image).toContain('RUN npm install')
      expect(image).not.toContain('pnpm install')
    }
  })

  it('builds the board, not just installs it', () => {
    for (const image of [dockerfile, dockerfilePrebuilt]) {
      expect(image).toContain('npx forum-web build')
    }
  })

  it('scopes the build-time DATA_SOURCE to the build command, not a persistent ENV', () => {
    for (const image of [dockerfile, dockerfilePrebuilt]) {
      expect(image).toContain('RUN DATA_SOURCE=fixture npx forum-web build')
      expect(image).not.toMatch(/^ENV DATA_SOURCE=/m)
    }
  })

  it('carries no board secret or database URL', () => {
    for (const file of [dockerfile, dockerfilePrebuilt, buildWorkflow]) {
      expect(file).not.toMatch(/AUTH_SECRET=\S/)
      expect(file).not.toContain('DATABASE_URL=postgres')
    }
  })

  it('drops root privilege before running', () => {
    for (const image of [dockerfile, dockerfilePrebuilt]) {
      expect(image).toContain('USER node')
    }
  })

  it('declares a healthcheck and an entrypoint, both made executable', () => {
    for (const image of [dockerfile, dockerfilePrebuilt]) {
      expect(image).toContain('RUN chmod +x docker-entrypoint.sh docker-healthcheck.sh')
      expect(image).toContain('HEALTHCHECK')
      expect(image).toContain('ENTRYPOINT ["./docker-entrypoint.sh"]')
    }
  })

  it('ignores what a local checkout has that the image build must not see', () => {
    for (const entry of ['node_modules', '.env', '.git']) {
      expect(dockerignore.split('\n')).toContain(entry)
    }
  })

  it('the entrypoint runs the web role by default and migrate on request, and refuses anything else', () => {
    expect(entrypoint).toContain('node_modules/.bin/forum-web start')
    expect(entrypoint).toContain('node_modules/.bin/meith migrate')
    expect(entrypoint).toMatch(/MEITH_ROLE:-web/)
    expect(entrypoint).toContain('exit 1')
  })

  it('the healthcheck has no opinion while migrate runs', () => {
    expect(healthcheck).toMatch(/MEITH_ROLE:-web.*=.*migrate/)
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
    for (const file of [buildWorkflow, compose, composePrebuilt]) {
      expect(file).not.toMatch(/hub\.docker\.com/)
      expect(file).not.toMatch(/circleci|travis-ci|buildkite/i)
    }
  })

  it('runs the whole board, mirroring the meith repository’s own Coolify compose shape, on both paths', () => {
    for (const file of [compose, composePrebuilt]) {
      for (const service of ['postgres', 'migrate', 'web', 'worker']) {
        expect(file).toMatch(new RegExp(`\\n {2}${service}:\\n`))
      }
    }
  })

  it('builds the image itself in the quick-start compose file, with no MEITH_IMAGE to set', () => {
    expect(compose).toContain('build: .')
    expect(compose).toContain('image: my-board')
    expect(compose).not.toMatch(/image:\s*\$\{MEITH_IMAGE/)
    expect(compose).not.toContain('pull_policy: always')
  })

  it('refuses to start without an image, loudly, rather than pulling something unpinned, in the prebuilt compose file', () => {
    expect(composePrebuilt).toMatch(/image: \$\{MEITH_IMAGE:\?/)
    expect(composePrebuilt).not.toMatch(/image: \$\{MEITH_IMAGE:-/)
    expect(composePrebuilt).toContain('pull_policy: always')
  })

  it('asks the operator for nothing to type by hand except the prebuilt path’s image', () => {
    for (const file of [compose, composePrebuilt]) {
      expect(file).toContain('AUTH_SECRET: $SERVICE_BASE64_64_AUTH')
      expect(file).toContain('TICK_SECRET: $SERVICE_BASE64_64_TICK')
      expect(file).toContain('$SERVICE_PASSWORD_POSTGRES')
      expect(file).not.toMatch(/AUTH_SECRET=\$\{[^}]*:-/)
    }
  })

  it('publishes no ports, leaving the proxy in front', () => {
    for (const file of [compose, composePrebuilt]) {
      expect(file).not.toMatch(/^\s*ports:/m)
    }
  })

  it('drives the tick without a compiled worker binary', () => {
    for (const file of [compose, composePrebuilt]) {
      expect(file).toMatch(/system\/tick/)
      expect(file).toContain('Authorization: Bearer')
    }
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

  it('mounts the uploads and backups volumes into web and migrate, on both paths', () => {
    for (const file of [compose, composePrebuilt]) {
      expect([...file.matchAll(/uploads:\/app\/\.uploads/g)]).toHaveLength(2)
      expect([...file.matchAll(/backups:\/backups/g)]).toHaveLength(2)
    }
  })

  it('carries the postgres client tools and a backup directory, on both paths', () => {
    for (const file of [dockerfile, dockerfilePrebuilt]) {
      expect(file).toMatch(/postgresql18-client/)
      expect(file).toMatch(/ENV BACKUP_DIR=\/backups/)
    }
  })

  it('tells both deploy stories, and the local alternative', () => {
    const readme = files.get('README.md')!
    expect(readme).toMatch(/push this repository to github/i)
    expect(readme).toMatch(/github actions/i)
    expect(readme).toMatch(/coolify/i)
    expect(readme).toMatch(/quick start/i)
    expect(readme).toMatch(/advanced/i)
    expect(readme).toContain('MEITH_IMAGE')
    expect(readme).toContain('docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION=')
    expect(readme).toMatch(/-t my-board \.\s*```/)
  })

  it('leads the README advanced-path deploy step with the sha tag, not the floating latest one', () => {
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
      buildWorkflow.indexOf('docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION'),
    )
  })
})

describe('the by-hand compose file — the third path, with no panel generating secrets', () => {
  const files = scaffold(OPTIONS)
  const byHand = files.get('docker-compose.byhand.yaml')!

  it('exists only on the self-host target', () => {
    expect(byHand).toBeDefined()
    expect(
      scaffold({ ...OPTIONS, target: 'vercel' }).get('docker-compose.byhand.yaml'),
    ).toBeUndefined()
  })

  it('runs the whole board, the same four services as the Coolify files', () => {
    for (const service of ['postgres', 'migrate', 'web', 'worker']) {
      expect(byHand).toMatch(new RegExp(`\\n {2}${service}:\\n`))
    }
  })

  it('builds the image itself, with no MEITH_IMAGE to set', () => {
    expect(byHand).toContain('build: .')
    expect(byHand).toContain('image: my-board')
    expect(byHand).not.toMatch(/image:\s*\$\{MEITH_IMAGE/)
  })

  it('reads every secret from its own .env, not from a panel', () => {
    expect(byHand).not.toContain('SERVICE_BASE64_64_AUTH')
    expect(byHand).not.toContain('SERVICE_PASSWORD_POSTGRES')
    expect(byHand).toMatch(/AUTH_SECRET: \$\{AUTH_SECRET:\?/)
    expect(byHand).toMatch(/TICK_SECRET: \$\{TICK_SECRET:\?/)
    expect(byHand).toMatch(/POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:-community\}/)
    expect(byHand).toMatch(/APP_URL: \$\{APP_URL:-http:\/\/localhost:3000\}/)
  })

  it('publishes a port for the reverse proxy in front of it, unlike the Coolify files', () => {
    expect(byHand).toMatch(/ports:\n\s*- '\$\{PORT:-127\.0\.0\.1:3000\}:3000'/)
    expect(files.get('docker-compose.yaml')).not.toMatch(/^\s*ports:/m)
  })

  it('counts the one reverse proxy the guide sets up, unlike Coolify which is the only hop itself', () => {
    expect(byHand).toMatch(/TRUSTED_PROXY_HOPS: \$\{TRUSTED_PROXY_HOPS:-1\}/)
  })

  it('drives the tick without a compiled worker binary, the same way as the Coolify files', () => {
    expect(byHand).toMatch(/system\/tick/)
    expect(byHand).toContain('Authorization: Bearer')
  })

  it('forwards the cache driver and offers a redis profile, so scaling out needs no new file', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Compose variable syntax, not a template-string typo
    expect(byHand).toContain('CACHE_DRIVER: ${CACHE_DRIVER:-next}')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Compose variable syntax, not a template-string typo
    expect(byHand).toContain('REDIS_URL: ${REDIS_URL:-}')
    expect(byHand).toMatch(/\n {2}redis:\n\s*profiles: \['redis'\]/)
  })

  it('mounts the uploads and backups volumes and forwards the off-site destination', () => {
    expect([...byHand.matchAll(/uploads:\/app\/\.uploads/g)]).toHaveLength(2)
    expect([...byHand.matchAll(/backups:\/backups/g)]).toHaveLength(2)
    for (const variable of [
      'BACKUP_S3_BUCKET',
      'BACKUP_S3_REGION',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_SECRET_ACCESS_KEY',
      'BACKUP_S3_ENDPOINT',
      'BACKUP_S3_PREFIX',
    ]) {
      expect(byHand).toContain(`${variable}: \${${variable}:-}`)
    }
  })

  it('points the by-hand guide at itself, so a stale name would show up as a broken snippet', () => {
    expect(byHand).toContain('docs/getting-started/deployment/docker-compose.md')
    expect(byHand).toContain('COMPOSE_FILE=docker-compose.byhand.yaml')
  })
})

describe('the update workflow — releases arrive as pull requests', () => {
  const selfHost = scaffold(OPTIONS).get('.github/workflows/update.yml')!

  it('ships identically on both targets, since the updater detects the target itself', () => {
    expect(scaffold({ ...OPTIONS, target: 'vercel' }).get('.github/workflows/update.yml')).toBe(
      selfHost,
    )
  })

  it('runs the published updater at latest, never a pinned copy that would age', () => {
    expect(selfHost).toContain('npx --yes create-meith@latest update')
  })

  it('runs weekly and on demand, with the two permissions a pull request needs', () => {
    expect(selfHost).toMatch(/schedule:\s*\n\s*- cron: '30 4 \* \* 1'/)
    expect(selfHost).toContain('workflow_dispatch:')
    expect(selfHost).toContain('contents: write')
    expect(selfHost).toContain('pull-requests: write')
  })

  it('uses only the automatic token — no secret to configure', () => {
    expect(selfHost).not.toMatch(/secrets\.(?!GITHUB_TOKEN)[A-Z_]+/)
    expect(selfHost).toMatch(/GH_TOKEN: \$\{\{ github\.token \}\}/)
  })

  it('does nothing when the updater changed nothing', () => {
    expect(selfHost).toContain('git status --porcelain')
  })

  it('opens or refreshes one pull request per update, on a branch of its own', () => {
    expect(selfHost).toContain('git checkout -B meith-update')
    expect(selfHost).toContain('git push -f origin meith-update')
    expect(selfHost).toContain('gh pr create')
    expect(selfHost).toContain('gh pr edit meith-update')
  })

  it('reads the version it announces from package.json, not from a number typed by hand', () => {
    expect(selfHost).toContain("require('./package.json').dependencies['@meith/web']")
    expect(selfHost).not.toMatch(/Meith 1\.2\.3/)
  })

  it('links the release notes and tells the operator to back up and run meith upgrade', () => {
    expect(selfHost).toContain('https://github.com/meith-dev/meith/releases/tag/v$VERSION')
    expect(selfHost).toMatch(/backup/i)
    expect(selfHost).toMatch(/meith upgrade/)
  })

  it('names the repository setting that gates pull-request creation', () => {
    expect(selfHost).toContain('Allow GitHub')
    expect(selfHost).toContain('Actions → General')
  })

  it('keeps Dependabot beside it on both targets, to move the action this workflow pins', () => {
    const dependabot = scaffold(OPTIONS).get('.github/dependabot.yml')
    expect(dependabot).toBeDefined()
    expect(scaffold({ ...OPTIONS, target: 'vercel' }).get('.github/dependabot.yml')).toBe(
      dependabot,
    )
  })

  it('leads the README Upgrading section with the workflow, keeping the by-hand path beneath', () => {
    for (const target of ['self-host', 'vercel'] as const) {
      const readme = scaffold({ ...OPTIONS, target }).get('README.md')!
      const upgrading = readme.slice(readme.indexOf('## Upgrading'))
      expect(upgrading).toContain('.github/workflows/update.yml')
      expect(upgrading.indexOf('update.yml')).toBeLessThan(
        upgrading.indexOf('npx create-meith@latest update'),
      )
      expect(upgrading).toContain('npm install --save-exact @meith/web@latest')
    }
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
        'Dockerfile.prebuilt',
        'README.md',
        'board.plugins.json',
        'docker-compose.byhand.yaml',
        'docker-compose.prebuilt.yaml',
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
  'package.json': '0cfc3fa53d8d1976c1b9e252e15672ff9f71e4741109a7fd2e475cf40d9c7ab1',
  '.npmrc': 'b147ab9c34152b7b2b4c8464680b4f3ed5e8dbfa35edfdfa7114fd8ac9e61121',
  'meith.config.ts': 'df13fc2f73d0d69c05bf75cf8ddfca4640a616731979c7fc51a97f3a6c0d4dee',
  'board.plugins.json': '5775237a361a9183f19cef427633bade5d3d96b4b219e5fc455a304e70319320',
  'meith.plugins.ts': '84a5d007307ded9fead1b69155a313e90a239dfce037c574aafedc05f1e9ce23',
  '.env.example': 'e160944cbb1fba18c67ef7e55d6f640cb847f77125d7fbf9e6f2426344aa8865',
  '.gitignore': '4df33d67d3f6cab040df85bda5505ff64431892d3207eb2ea07a571a8386a0dc',
  Dockerfile: 'd012f8daa0f10ffb0f3887c8b7658fc4276133c978576b2b3a3216ba8c0ee292',
  'Dockerfile.prebuilt': 'e5a9ecdd9bc2e9a9da4523ecc2c204be9c45b769e8d4bdb2a70928f8bade17a8',
  'docker-entrypoint.sh': '7b8ce8a48ade0285f0954ed5dff3dd82a94586ec321e54fb1c65dec768258117',
  'docker-healthcheck.sh': '26c30e65b5401ec94d19c7eb4b22e46b51baf27e087699f91fc8d5fcc5280048',
  '.dockerignore': '620ca0bdf50f76e3817c135ee43afe56669b7b3caaad86b4926021cc52dd3c4b',
  '.github/dependabot.yml': '613f8570b971bfc38276ad9fa5e90c9b0214e21bf791e5493c00d7a8ee2b41ea',
  '.github/workflows/build.yml': 'f9b3342a1e94b82660a83d233b1c3156e1ba71841c0920d998d4e83b43c8bc13',
  '.github/workflows/update.yml':
    '5c56ff79b04d29928645b49be82bc47fac65d88a84cfc066d64b932123c620f0',
  'docker-compose.yaml': '6c9715262ce8e8f77c3cf661683bcb11be803544f5e902a7d1507ac45d2211b2',
  'docker-compose.prebuilt.yaml':
    '069997fca8288caaf2e24a98413d23ffa7903ea370e23b6bc4c01358cd7cd896',
  'docker-compose.byhand.yaml': '8217237f19f31db09572ba117c3c0708153254e8d25e22333b21c77abbe5c495',
  'README.md': 'b7172e689c8b25d28f5143d02aa62087f6041bb0375b3e237d69a0fe8acc4648',
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
      '.github/dependabot.yml',
      '.github/workflows/update.yml',
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
      meith: 'meith',
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

    expect(config.buildCommand).toBe('meith migrate && forum-web build --at-root')
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
    expect(buildCommand.indexOf('meith migrate')).toBeLessThan(
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
    expect(readme).toContain('meith -- backup')
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
