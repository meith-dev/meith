import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CODE_VERSION } from './upgrade'

let manifestDir: string
let manifestPath: string
let targetParent: string

async function writeManifest(plugins: readonly unknown[]): Promise<void> {
  await writeFile(manifestPath, JSON.stringify({ plugins }), 'utf8')
}

beforeEach(async () => {
  manifestDir = await mkdtemp(join(tmpdir(), 'board-eject-manifest-'))
  manifestPath = join(manifestDir, 'board.plugins.json')
  targetParent = await mkdtemp(join(tmpdir(), 'board-eject-target-'))
  process.env.BOARD_PLUGINS_MANIFEST = manifestPath
  await writeManifest([])
})

afterEach(() => {
  delete process.env.BOARD_PLUGINS_MANIFEST
})

const { boardEject } = await import('./board-eject')

describe('boardEject', () => {
  it('refuses no directory argument', async () => {
    await expect(boardEject([])).rejects.toThrow(/Usage: community board:eject/)
  })

  it('refuses a directory whose basename is not a valid npm package name', async () => {
    const target = join(targetParent, 'My-Board')
    await expect(boardEject([target])).rejects.toThrow(/is not a usable project name/)
  })

  it('refuses a non-empty target directory', async () => {
    const target = join(targetParent, 'my-board')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'keep.txt'), 'x')

    await expect(boardEject([target])).rejects.toThrow(/already exists and is not empty/)
  })

  it('reports plainly when the plugin manifest cannot be found', async () => {
    process.env.BOARD_PLUGINS_MANIFEST = join(manifestDir, 'missing.json')
    const target = join(targetParent, 'my-board')

    await expect(boardEject([target])).rejects.toThrow(
      /could not find this build's plugin manifest/,
    )
  })

  it("ejects a complete workspace pinned to the running build's exact version", async () => {
    const target = join(targetParent, 'my-board')

    expect(await boardEject([target])).toBe(0)

    const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
    expect(manifest.name).toBe('my-board')
    expect(manifest.dependencies['@meith/web']).toBe(CODE_VERSION)
    expect(manifest.dependencies['@meith/cli']).toBe(CODE_VERSION)
    expect(manifest.dependencies['@meith/theme-default']).toBe(CODE_VERSION)
    expect(manifest.version).not.toBe('latest')

    // The deploy kit rides along, unmodified — same machinery create-meith uses.
    await expect(readFile(join(target, 'Dockerfile'), 'utf8')).resolves.toContain(
      `ghcr.io/meith-dev/meith-base:${CODE_VERSION}`,
    )
    await expect(readFile(join(target, 'compose.yml'), 'utf8')).resolves.toContain('services:')
    await expect(readFile(join(target, '.github/workflows/build.yml'), 'utf8')).resolves.toContain(
      'docker build',
    )
  })

  it("writes board.plugins.json from this build's actual manifest, not a placeholder", async () => {
    await writeManifest([{ key: 'dues', package: '@meith/plugin-dues', enabled: true }])
    const target = join(targetParent, 'my-board')

    await boardEject([target])

    const written = JSON.parse(await readFile(join(target, 'board.plugins.json'), 'utf8'))
    expect(written).toEqual({
      plugins: [{ key: 'dues', package: '@meith/plugin-dues', enabled: true }],
    })
  })

  it('renders an empty community.plugins.ts with no showcase wiring when the manifest is empty', async () => {
    const target = join(targetParent, 'my-board')
    await boardEject([target])

    const generated = await readFile(join(target, 'community.plugins.ts'), 'utf8')
    expect(generated).toContain('export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = []')
    expect(generated).not.toContain('community.demo.plugins')
    expect(generated).not.toContain('showcasePlugins')
  })

  it('renders one import and entry per manifest plugin, still with no showcase wiring', async () => {
    await writeManifest([
      { key: 'dues', package: '@meith/plugin-dues', enabled: true },
      { key: 'reference', package: '@meith/plugin-reference', enabled: false },
    ])
    const target = join(targetParent, 'my-board')

    await boardEject([target])

    const generated = await readFile(join(target, 'community.plugins.ts'), 'utf8')
    expect(generated).toContain(
      "import { messages as duesMessages, plugin as duesPlugin } from '@meith/plugin-dues'",
    )
    expect(generated).toContain(
      'import { messages as referenceMessages, plugin as referencePlugin } from ' +
        "'@meith/plugin-reference'",
    )
    expect(generated).toContain(
      "{ key: 'dues', enabled: true, plugin: duesPlugin, messages: duesMessages },",
    )
    expect(generated).toContain(
      "{ key: 'reference', enabled: false, plugin: referencePlugin, messages: referenceMessages },",
    )
    expect(generated).not.toContain('community.demo.plugins')
  })

  it('prints next steps naming what does not move', async () => {
    const target = join(targetParent, 'my-board')
    const lines: string[] = []
    const original = console.log
    console.log = (line: string) => lines.push(line)
    try {
      await boardEject([target])
    } finally {
      console.log = original
    }

    const output = lines.join('\n')
    expect(output).toContain('database')
    expect(output).toContain('uploads')
    expect(output).toContain('environment variable')
    expect(output).toMatch(/GitHub/i)
  })
})
