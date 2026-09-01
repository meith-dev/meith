import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { afterEach, describe, expect, it } from 'vitest'

import { run } from './cli'
import { DEFAULT_REPOSITORY_URL, type ScaffoldTarget, scaffold } from './scaffold'
import {
  compareExactVersions,
  mergeManifest,
  normalizeActionPins,
  parseExactVersion,
  planUpdate,
  runUpdate,
  substituteBoardName,
  TEMPLATE_BOARD_NAME,
  TEMPLATE_REPOSITORIES,
  templateTarballUrl,
  unpackTemplateTarball,
} from './update'

function manifest(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      name: 'my-board',
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: { dev: 'forum-web dev', build: 'forum-web build', meith: 'meith' },
      dependencies: {
        '@meith/web': '1.2.3',
        '@meith/cli': '1.2.3',
        '@meith/theme-default': '1.2.3',
        next: '16.0.0',
      },
      engines: { node: '>=22' },
      ...overrides,
    },
    null,
    2,
  )}\n`
}

describe('version parsing', () => {
  it('accepts only exact X.Y.Z versions', () => {
    expect(parseExactVersion('1.2.3')).toEqual([1, 2, 3])
    for (const value of ['^1.2.3', '1.2', 'latest', '1.2.3-rc.1', '']) {
      expect(parseExactVersion(value)).toBeNull()
    }
  })

  it('orders versions numerically, not lexically', () => {
    expect(compareExactVersions('0.9.0', '0.10.0')).toBeLessThan(0)
    expect(compareExactVersions('1.0.0', '0.30.1')).toBeGreaterThan(0)
    expect(compareExactVersions('1.2.3', '1.2.3')).toBe(0)
  })
})

describe('the manifest merge', () => {
  const previous = manifest()
  const next = manifest({
    dependencies: {
      '@meith/web': '1.3.0',
      '@meith/cli': '1.3.0',
      '@meith/theme-default': '1.3.0',
      next: '16.1.0',
    },
  })

  it('moves every pin the new scaffold names, next included', () => {
    const merged = JSON.parse(mergeManifest(previous, previous, next, '1.3.0'))
    expect(merged.dependencies).toEqual({
      '@meith/web': '1.3.0',
      '@meith/cli': '1.3.0',
      '@meith/theme-default': '1.3.0',
      next: '16.1.0',
    })
  })

  it('moves an installed @meith plugin the scaffold never named, and leaves a third-party one', () => {
    const current = manifest({
      dependencies: {
        '@meith/web': '1.2.3',
        '@meith/cli': '1.2.3',
        '@meith/theme-default': '1.2.3',
        '@meith/plugin-dues': '1.2.3',
        'some-markdown-helper': '4.5.6',
        next: '16.0.0',
      },
    })

    const merged = JSON.parse(mergeManifest(current, previous, next, '1.3.0'))
    expect(merged.dependencies['@meith/plugin-dues']).toBe('1.3.0')
    expect(merged.dependencies['some-markdown-helper']).toBe('4.5.6')
  })

  it('keeps a script the operator changed, and moves one they never touched', () => {
    const current = manifest({
      scripts: { dev: 'forum-web dev', build: 'forum-web build --debug', meith: 'meith' },
    })
    const moved = manifest({
      scripts: {
        dev: 'forum-web dev --at-root',
        build: 'forum-web build --at-root',
        meith: 'meith',
      },
    })

    const merged = JSON.parse(mergeManifest(current, previous, moved, '1.3.0'))
    expect(merged.scripts.dev).toBe('forum-web dev --at-root')
    expect(merged.scripts.build).toBe('forum-web build --debug')
  })

  it('keeps a script the operator added, and one they deleted stays deleted', () => {
    const current = manifest({
      scripts: { dev: 'forum-web dev', build: 'forum-web build', lint: 'biome check .' },
    })

    const merged = JSON.parse(mergeManifest(current, previous, next, '1.3.0'))
    expect(merged.scripts.lint).toBe('biome check .')
    expect(merged.scripts.meith).toBeUndefined()
  })

  it('with no previous tree, still moves every @meith pin and next, touching nothing else', () => {
    const current = manifest({
      scripts: { dev: 'forum-web dev --custom' },
      dependencies: { '@meith/web': '1.2.3', next: '16.0.0', leftpad: '1.0.0' },
    })

    const merged = JSON.parse(mergeManifest(current, null, next, '1.3.0'))
    expect(merged.dependencies['@meith/web']).toBe('1.3.0')
    expect(merged.dependencies.next).toBe('16.1.0')
    expect(merged.dependencies.leftpad).toBe('1.0.0')
    expect(merged.scripts.dev).toBe('forum-web dev --custom')
  })

  it('moves engines only while it is untouched', () => {
    const bumped = manifest({ engines: { node: '>=24' } })
    expect(JSON.parse(mergeManifest(previous, previous, bumped, '1.3.0')).engines).toEqual({
      node: '>=24',
    })

    const pinnedByHand = manifest({ engines: { node: '22.1.0' } })
    expect(JSON.parse(mergeManifest(pinnedByHand, previous, bumped, '1.3.0')).engines).toEqual({
      node: '22.1.0',
    })
  })
})

describe('the file plan', () => {
  const inputs = {
    newVersion: '1.3.0',
    current: new Map([
      ['package.json', manifest()],
      ['Dockerfile', 'FROM old'],
      ['docker-compose.yaml', 'services: old, edited by hand'],
      ['stale.sh', 'old helper'],
    ]),
    previous: new Map([
      ['package.json', manifest()],
      ['Dockerfile', 'FROM old'],
      ['docker-compose.yaml', 'services: old'],
      ['stale.sh', 'old helper'],
      ['Dockerfile.prebuilt', 'FROM base old'],
    ]),
    next: new Map([
      ['package.json', manifest({ dependencies: { '@meith/web': '1.3.0', next: '16.1.0' } })],
      ['Dockerfile', 'FROM new'],
      ['docker-compose.yaml', 'services: new'],
      ['.github/workflows/update.yml', 'name: Meith update'],
      ['Dockerfile.prebuilt', 'FROM base new'],
    ]),
  }
  const plan = planUpdate(inputs)

  it('rewrites a file the operator never touched', () => {
    expect(plan.writes.get('Dockerfile')).toBe('FROM new')
    expect(plan.updated).toContain('Dockerfile')
  })

  it('keeps a file the operator edited, and names it', () => {
    expect(plan.writes.has('docker-compose.yaml')).toBe(false)
    expect(plan.skipped).toContain('docker-compose.yaml')
  })

  it('does not resurrect a file the operator deleted', () => {
    expect(plan.writes.has('Dockerfile.prebuilt')).toBe(false)
    expect(plan.created).not.toContain('Dockerfile.prebuilt')
  })

  it('creates a file this release introduces', () => {
    expect(plan.writes.get('.github/workflows/update.yml')).toBe('name: Meith update')
    expect(plan.created).toContain('.github/workflows/update.yml')
  })

  it('removes an untouched file the release stopped shipping, and keeps an edited one', () => {
    expect(plan.deletes).toContain('stale.sh')

    const edited = planUpdate({
      ...inputs,
      current: new Map([...inputs.current, ['stale.sh', 'old helper, edited']]),
    })
    expect(edited.deletes).not.toContain('stale.sh')
    expect(edited.skipped).toContain('stale.sh')
  })

  it('merges the manifest rather than overwriting it', () => {
    const merged = JSON.parse(plan.writes.get('package.json') ?? '{}')
    expect(merged.dependencies['@meith/web']).toBe('1.3.0')
    expect(merged.dependencies['@meith/cli']).toBe('1.3.0')
  })

  it('does not mistake a Dependabot action bump for a hand edit', () => {
    const workflow = planUpdate({
      newVersion: '1.3.0',
      current: new Map([
        [
          '.github/workflows/build.yml',
          '      - uses: actions/checkout@bbbb # v8\n        with: x',
        ],
      ]),
      previous: new Map([
        [
          '.github/workflows/build.yml',
          '      - uses: actions/checkout@aaaa # v7\n        with: x',
        ],
      ]),
      next: new Map([['.github/workflows/build.yml', 'rewritten']]),
    })

    expect(workflow.writes.get('.github/workflows/build.yml')).toBe('rewritten')
  })

  it('with no previous tree, changes nothing beyond the manifest and lists what to review', () => {
    const degraded = planUpdate({ ...inputs, previous: null })

    expect([...degraded.writes.keys()]).toEqual(['package.json'])
    expect(degraded.deletes).toEqual([])
    expect(degraded.review).toEqual([
      '.github/workflows/update.yml',
      'Dockerfile',
      'Dockerfile.prebuilt',
      'docker-compose.yaml',
    ])
  })
})

describe('action-pin normalization', () => {
  it('erases only the pin on a uses line', () => {
    const line = '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7'
    expect(normalizeActionPins(line)).toBe('      - uses: actions/checkout@pin')
    expect(normalizeActionPins('IMAGE=ghcr.io/x@sha256:abc')).toBe('IMAGE=ghcr.io/x@sha256:abc')
  })
})

function tarEntry(name: string, content: string): Uint8Array {
  const encoder = new TextEncoder()
  const body = encoder.encode(content)
  const header = new Uint8Array(512)
  header.set(encoder.encode(name), 0)
  header.set(encoder.encode(body.length.toString(8).padStart(11, '0')), 124)
  header[156] = 48
  const padded = new Uint8Array(Math.ceil(body.length / 512) * 512)
  padded.set(body)
  const entry = new Uint8Array(512 + padded.length)
  entry.set(header)
  entry.set(padded, 512)
  return entry
}

function tarball(entries: readonly (readonly [string, string])[]): Uint8Array {
  const blocks = entries.map(([name, content]) => tarEntry(name, content))
  const size = blocks.reduce((total, block) => total + block.length, 1024)
  const archive = new Uint8Array(size)
  let at = 0
  for (const block of blocks) {
    archive.set(block, at)
    at += block.length
  }
  return new Uint8Array(gzipSync(archive))
}

describe('the template tarball', () => {
  it('is addressed at the tag of the version the board is on', () => {
    expect(templateTarballUrl('self-host', '1.2.3')).toBe(
      `https://codeload.github.com/${TEMPLATE_REPOSITORIES['self-host']}/tar.gz/refs/tags/v1.2.3`,
    )
    expect(templateTarballUrl('vercel', '1.2.3')).toContain(TEMPLATE_REPOSITORIES.vercel)
  })

  it('unpacks past the tag directory and renames the template board to this one', () => {
    const data = tarball([
      ['template-1.2.3/package.json', `{"name":"${TEMPLATE_BOARD_NAME}"}`],
      ['template-1.2.3/.github/workflows/build.yml', 'name: build'],
    ])

    const tree = unpackTemplateTarball(data, 'my-board')
    expect(tree.get('package.json')).toBe('{"name":"my-board"}')
    expect(tree.get('.github/workflows/build.yml')).toBe('name: build')
  })

  it('substitutes nothing for a board that kept the template name', () => {
    expect(substituteBoardName('# meith-board', TEMPLATE_BOARD_NAME)).toBe('# meith-board')
    expect(substituteBoardName('image: meith-board', 'forum')).toBe('image: forum')
  })
})

describe('the update command', () => {
  const dirs: string[] = []

  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
  })

  async function boardDir(files: ReadonlyMap<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'meith-update-'))
    dirs.push(dir)
    for (const [path, content] of files) {
      await mkdir(dirname(join(dir, path)), { recursive: true })
      await writeFile(join(dir, path), content, 'utf8')
    }
    return dir
  }

  function pristine(version: string, target: ScaffoldTarget = 'self-host') {
    return scaffold({ name: 'my-board', version, repositoryUrl: DEFAULT_REPOSITORY_URL, target })
  }

  it('refuses a directory that is not a board', async () => {
    const dir = await boardDir(new Map([['package.json', '{"name":"library"}']]))
    const result = await runUpdate('1.3.0', { cwd: dir })
    expect(result.code).toBe(1)
    expect(result.lines.join('\n')).toMatch(/does not depend on @meith\/web/)
  })

  it('refuses a ranged pin, naming the fix', async () => {
    const dir = await boardDir(
      new Map([['package.json', manifest({ dependencies: { '@meith/web': '^1.2.3' } })]]),
    )
    const result = await runUpdate('1.3.0', { cwd: dir })
    expect(result.code).toBe(1)
    expect(result.lines.join('\n')).toMatch(/--save-exact/)
  })

  it('says so when the board is already current', async () => {
    const dir = await boardDir(pristine('1.3.0'))
    const result = await runUpdate('1.3.0', { cwd: dir })
    expect(result.code).toBe(0)
    expect(result.lines.join('\n')).toMatch(/Already at 1\.3\.0/)
  })

  it('refuses a downgrade and points at the newest updater', async () => {
    const dir = await boardDir(pristine('1.4.0'))
    const result = await runUpdate('1.3.0', { cwd: dir })
    expect(result.code).toBe(1)
    expect(result.lines.join('\n')).toMatch(/create-meith@latest update/)
  })

  it('refuses a jump past two majors and names the staged route', async () => {
    const dir = await boardDir(pristine('1.0.0'))
    const result = await runUpdate('4.0.0', { cwd: dir })
    expect(result.code).toBe(1)
    expect(result.lines.join('\n')).toMatch(/npx create-meith@3 update/)
  })

  it('updates a pristine board wholesale, and a customized file not at all', async () => {
    const previous = new Map(pristine('1.2.3'))
    previous.delete('.github/workflows/update.yml')
    const onDisk = new Map(previous)
    onDisk.set('Dockerfile', `${onDisk.get('Dockerfile')}\nRUN echo mine\n`)
    const dir = await boardDir(onDisk)

    const asked: string[] = []
    const result = await runUpdate('1.3.0', {
      cwd: dir,
      loadPrevious: async (target, version) => {
        asked.push(`${target}@${version}`)
        return previous
      },
      refreshLockfile: async () => null,
    })

    expect(result.code).toBe(0)
    expect(asked).toEqual(['self-host@1.2.3'])

    const merged = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    expect(merged.dependencies['@meith/web']).toBe('1.3.0')
    expect(merged.dependencies['@meith/cli']).toBe('1.3.0')
    expect(merged.dependencies['@meith/theme-default']).toBe('1.3.0')

    const workflow = await readFile(join(dir, '.github/workflows/update.yml'), 'utf8')
    expect(workflow).toContain('create-meith@latest update')

    const dockerfile = await readFile(join(dir, 'Dockerfile'), 'utf8')
    expect(dockerfile).toContain('RUN echo mine')
    expect(result.lines.join('\n')).toMatch(/kept\s+Dockerfile/)
    expect(result.lines.join('\n')).toMatch(/meith upgrade/)
  })

  it('detects a Vercel board from its vercel.json', async () => {
    const dir = await boardDir(pristine('1.2.3', 'vercel'))
    const asked: string[] = []
    await runUpdate('1.3.0', {
      cwd: dir,
      loadPrevious: async (target) => {
        asked.push(target)
        return pristine('1.2.3', 'vercel')
      },
      refreshLockfile: async () => null,
    })
    expect(asked).toEqual(['vercel'])
  })

  it('falls back to the manifest alone when the previous template is unreachable', async () => {
    const dir = await boardDir(pristine('1.2.3'))
    const result = await runUpdate('1.3.0', {
      cwd: dir,
      loadPrevious: async () => null,
      refreshLockfile: async () => null,
    })

    expect(result.code).toBe(0)
    const merged = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    expect(merged.dependencies['@meith/web']).toBe('1.3.0')
    expect(result.lines.join('\n')).toMatch(/Could not read the v1\.2\.3 template/)
  })

  it('is reachable as `npx create-meith update`, so `update` is not a board name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meith-update-cli-'))
    dirs.push(dir)
    const previousCwd = process.cwd()
    process.chdir(dir)
    try {
      const result = await run(['update'], '1.3.0')
      expect(result.code).toBe(1)
      expect(result.lines.join('\n')).toMatch(/no package\.json here/)
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('is named in the CLI help', async () => {
    const result = await run(['--help'], '1.3.0')
    expect(result.lines.join('\n')).toContain('npx create-meith@latest update')
  })
})
