import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import BOARDS_JSON from '../../../scripts/boards.json'

interface Board {
  readonly manifestFile: string
  readonly packageFile: string
  readonly outputFile: string
  readonly packageLabel: string
  readonly filterName: string
}

const BOARDS = BOARDS_JSON as readonly Board[]
const FIXTURE_PACKAGE = '@meith/plugin-fixture'
const FIXTURE_KEY = 'fixture'

let root: string

async function readBoardFile(relative: string): Promise<string> {
  return readFile(join(root, relative), 'utf8')
}

async function writeFixtureTree(): Promise<void> {
  for (const board of BOARDS) {
    await mkdir(dirname(join(root, board.manifestFile)), { recursive: true })
    await writeFile(join(root, board.manifestFile), '{\n  "plugins": []\n}\n', 'utf8')
    await writeFile(
      join(root, board.packageFile),
      `${JSON.stringify(
        { name: board.packageLabel, dependencies: { [FIXTURE_PACKAGE]: 'workspace:*' } },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plugin-manifest-roundtrip-'))
  await writeFixtureTree()
  process.env.MEITH_BOARD_PLUGINS_ROOT = root
})

afterEach(async () => {
  delete process.env.MEITH_BOARD_PLUGINS_ROOT
  await rm(root, { recursive: true, force: true })
})

const { pluginAdd, pluginRemove } = await import('./plugin-manifest')

describe('pluginAdd/pluginRemove, the real round trip', () => {
  it('adds the same entry to every board carried in scripts/boards.json, and regenerates every board', async () => {
    expect(await pluginAdd([FIXTURE_PACKAGE])).toBe(0)

    for (const board of BOARDS) {
      const manifest = JSON.parse(await readBoardFile(board.manifestFile))
      expect(manifest).toEqual({
        plugins: [{ key: FIXTURE_KEY, package: FIXTURE_PACKAGE, enabled: true }],
      })

      const generated = await readBoardFile(board.outputFile)
      expect(generated).toContain(
        `import { messages as fixtureMessages, plugin as fixturePlugin } from '${FIXTURE_PACKAGE}'`,
      )
      expect(generated).toContain(
        `{ key: '${FIXTURE_KEY}', enabled: true, plugin: fixturePlugin, messages: fixtureMessages }`,
      )
    }
  })

  it('leaves every board manifest identical — the parity tests/boards-stock.test.ts asserts', async () => {
    await pluginAdd([FIXTURE_PACKAGE])

    const manifests = await Promise.all(BOARDS.map((board) => readBoardFile(board.manifestFile)))
    for (const manifest of manifests) {
      expect(JSON.parse(manifest)).toEqual(JSON.parse(manifests[0] as string))
    }
  })

  it('plugin:remove restores every board to byte-identical state', async () => {
    const before = await Promise.all(BOARDS.map((board) => readBoardFile(board.manifestFile)))

    await pluginAdd([FIXTURE_PACKAGE])
    expect(await pluginRemove([FIXTURE_KEY])).toBe(0)

    const after = await Promise.all(BOARDS.map((board) => readBoardFile(board.manifestFile)))
    expect(after).toEqual(before)
  })

  it('refuses a legal key whose repeated hyphen would break the generated import, before touching any board (MEI-87, was a raw Biome parse error surfacing through the generator)', async () => {
    const before = await Promise.all(BOARDS.map((board) => readBoardFile(board.manifestFile)))

    await expect(pluginAdd([FIXTURE_PACKAGE, '--key', 'foo--bar'])).rejects.toThrow(
      /"foo--bar" is a valid plugin key, but the identifier/,
    )

    const after = await Promise.all(BOARDS.map((board) => readBoardFile(board.manifestFile)))
    expect(after).toEqual(before)
  })

  it('rolls every board back together when one board refuses the package', async () => {
    const [first, ...rest] = BOARDS
    if (first === undefined) throw new Error('scripts/boards.json listed no boards')

    const strippedPackage = JSON.parse(await readBoardFile(first.packageFile))
    delete strippedPackage.dependencies[FIXTURE_PACKAGE]
    await writeFile(
      join(root, first.packageFile),
      `${JSON.stringify(strippedPackage, null, 2)}\n`,
      'utf8',
    )

    const before = await Promise.all(BOARDS.map((board) => readBoardFile(board.manifestFile)))

    await expect(pluginAdd([FIXTURE_PACKAGE])).rejects.toThrow(
      new RegExp(`not a dependency of ${first.packageLabel.replace('/', '\\/')}`),
    )

    const after = await Promise.all(BOARDS.map((board) => readBoardFile(board.manifestFile)))
    expect(after).toEqual(before)

    for (const board of rest) {
      await expect(readBoardFile(board.outputFile)).rejects.toThrow()
    }
  })
})
