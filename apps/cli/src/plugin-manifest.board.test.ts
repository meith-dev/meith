import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { assertBoardCheckout, regenerateBoard, renderBoardModule } from './plugin-manifest'

let dir: string

async function seedBoard(
  manifest: unknown,
  dependencies: Record<string, string> = {},
): Promise<void> {
  await writeFile(join(dir, 'board.plugins.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'a-board', dependencies }, null, 2)}\n`,
    'utf8',
  )
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'meith-board-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('renderBoardModule', () => {
  it('renders an empty board with no plugin imports', () => {
    const source = renderBoardModule([])
    expect(source).toContain("import type { InstalledPlugin } from '@meith/web/config'")
    expect(source).toContain('export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = []')
    expect(source).not.toContain('import { messages')
    expect(source).toContain('Generated from board.plugins.json')
    expect(source.endsWith('\n')).toBe(true)
  })

  it('imports a plugin and lists it, camel-casing a hyphenated key', () => {
    const source = renderBoardModule([
      { key: 'event-calendar', package: '@meith/plugin-event-calendar', enabled: true },
    ])
    expect(source).toContain(
      "import { messages as eventCalendarMessages, plugin as eventCalendarPlugin } from '@meith/plugin-event-calendar'",
    )
    expect(source).toContain(
      "{ key: 'event-calendar', enabled: true, plugin: eventCalendarPlugin, messages: eventCalendarMessages },",
    )
  })

  it('marks a disabled plugin', () => {
    const source = renderBoardModule([
      { key: 'dues', package: '@meith/plugin-dues', enabled: false },
    ])
    expect(source).toContain("{ key: 'dues', enabled: false,")
  })
})

describe('assertBoardCheckout', () => {
  it('passes when a .git is present — a real board checkout', async () => {
    await mkdir(join(dir, '.git'))
    expect(() => assertBoardCheckout(dir)).not.toThrow()
  })

  it('refuses when there is no .git, since that is most likely the deployed container', () => {
    expect(() => assertBoardCheckout(dir)).toThrow(/only take effect when the image is rebuilt/)
  })
})

describe('regenerateBoard', () => {
  it('writes meith.plugins.ts from the manifest when the package is installed', async () => {
    await seedBoard(
      { plugins: [{ key: 'dues', package: '@meith/plugin-dues', enabled: true }] },
      { '@meith/plugin-dues': '^1.0.0' },
    )

    const result = regenerateBoard(dir)
    expect(result.ok).toBe(true)

    const written = await readFile(join(dir, 'meith.plugins.ts'), 'utf8')
    expect(written).toBe(
      renderBoardModule([{ key: 'dues', package: '@meith/plugin-dues', enabled: true }]),
    )
  })

  it('refuses a plugin that is not a dependency, naming the npm install to run', async () => {
    await seedBoard({ plugins: [{ key: 'dues', package: '@meith/plugin-dues' }] })

    const result = regenerateBoard(dir)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('npm install @meith/plugin-dues')
  })

  it('refuses an invalid plugin key', async () => {
    await seedBoard(
      { plugins: [{ key: 'Not A Key', package: '@meith/plugin-dues' }] },
      { '@meith/plugin-dues': '^1.0.0' },
    )

    const result = regenerateBoard(dir)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('not a valid plugin key')
  })

  it('refuses two keys that would generate the same identifier', async () => {
    await seedBoard(
      {
        plugins: [
          { key: 'a-1', package: '@meith/plugin-a-1' },
          { key: 'a1', package: '@meith/plugin-a1' },
        ],
      },
      { '@meith/plugin-a-1': '^1.0.0', '@meith/plugin-a1': '^1.0.0' },
    )

    const result = regenerateBoard(dir)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('both generate the identifier')
  })
})
