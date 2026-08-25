import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  formatWithBiome,
  PLUGIN_KEY_PATTERN,
  renderPluginsModule,
  validateManifest,
} from '../scripts/board-plugins.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST_FILE = 'apps/community/board.plugins.json'

const ENTRY = { key: 'dues', package: '@meith/plugin-dues', enabled: true }

describe('renderPluginsModule', () => {
  it('is deterministic: the same manifest renders byte-identical output twice', () => {
    const first = renderPluginsModule([ENTRY])
    const second = renderPluginsModule([ENTRY])
    expect(first).toBe(second)
  })

  it('imports and installs every manifest entry, in manifest order', () => {
    const source = renderPluginsModule([
      ENTRY,
      { key: 'widget', package: '@meith/plugin-widget', enabled: false },
    ])

    expect(source).toContain(
      "import { messages as duesMessages, plugin as duesPlugin } from '@meith/plugin-dues'",
    )
    expect(source).toContain(
      "import { messages as widgetMessages, plugin as widgetPlugin } from '@meith/plugin-widget'",
    )
    const duesAt = source.indexOf("key: 'dues'")
    const widgetAt = source.indexOf("key: 'widget'")
    expect(duesAt).toBeGreaterThan(-1)
    expect(widgetAt).toBeGreaterThan(duesAt)
    expect(source).toContain(
      "{ key: 'dues', enabled: true, plugin: duesPlugin, messages: duesMessages }",
    )
    expect(source).toContain(
      "{ key: 'widget', enabled: false, plugin: widgetPlugin, messages: widgetMessages }",
    )
  })

  it('keeps the escape hatch: showcasePlugins() is always spread in, after the manifest entries', () => {
    const source = renderPluginsModule([ENTRY])
    const duesAt = source.indexOf("key: 'dues'")
    const spreadAt = source.indexOf('...showcasePlugins()')
    expect(spreadAt).toBeGreaterThan(duesAt)
  })

  it('never imports dynamically and never reads the filesystem at the module level', () => {
    const source = renderPluginsModule([ENTRY])
    expect(source).not.toMatch(/\bimport\s*\(/)
    expect(source).not.toMatch(/\brequire\s*\(/)
    expect(source).not.toMatch(/\breaddir|readFile/)
  })

  it('carries the generated-file header', () => {
    const source = renderPluginsModule([])
    expect(source).toMatch(/^\/\/ GENERATED FILE — do not edit\./)
    expect(source).toContain('pnpm board:gen')
  })
})

describe('formatWithBiome', () => {
  it('is deterministic: formatting the same source twice gives byte-identical output', async () => {
    const source = renderPluginsModule([ENTRY])
    const first = await formatWithBiome(source, { root: ROOT })
    const second = await formatWithBiome(source, { root: ROOT })
    expect(first).toBe(second)
  })

  it('sorts the manifest package import into the @meith import group, formatter-clean', async () => {
    const formatted = await formatWithBiome(renderPluginsModule([ENTRY]), { root: ROOT })
    expect(formatted).toBe(formatted.trim().concat('\n'))
    const lines = formatted.split('\n')
    const coreAt = lines.findIndex((line) => line.includes("from '@meith/core'"))
    const duesAt = lines.findIndex((line) => line.includes("from '@meith/plugin-dues'"))
    const kitAt = lines.findIndex((line) => line.includes("from '@meith/plugin-kit'"))
    expect(coreAt).toBeLessThan(duesAt)
    expect(duesAt).toBeLessThan(kitAt)
  })
})

describe('validateManifest', () => {
  const deps = new Set(['@meith/plugin-dues'])

  it('accepts a manifest whose keys and packages are all in order', () => {
    expect(() => validateManifest([ENTRY], deps, MANIFEST_FILE)).not.toThrow()
  })

  it('refuses a duplicate key', () => {
    expect(() => validateManifest([ENTRY, ENTRY], deps, MANIFEST_FILE)).toThrow(/listed twice/)
  })

  it('refuses a key definePlugin would refuse', () => {
    expect(() => validateManifest([{ ...ENTRY, key: 'Dues' }], deps, MANIFEST_FILE)).toThrow(
      /not a valid plugin key/,
    )
    expect(PLUGIN_KEY_PATTERN.test('Dues')).toBe(false)
    expect(PLUGIN_KEY_PATTERN.test('dues')).toBe(true)
  })

  it('refuses a package apps/community does not depend on, and names the fix', () => {
    expect(() =>
      validateManifest([{ ...ENTRY, package: '@meith/plugin-widget' }], deps, MANIFEST_FILE),
    ).toThrow('pnpm add @meith/plugin-widget --filter @meith/web')
  })

  it('names a different board and filter target when told to, for boards/stock', () => {
    expect(() =>
      validateManifest(
        [{ ...ENTRY, package: '@meith/plugin-widget' }],
        deps,
        'boards/stock/board.plugins.json',
        {
          packageLabel: 'boards/stock',
          filterName: '@meith/board-stock',
        },
      ),
    ).toThrow(
      'is not a dependency of boards/stock. Run `pnpm add @meith/plugin-widget --filter @meith/board-stock`',
    )
  })

  it('refuses a key whose repeated hyphen makes toIdentifier produce an invalid identifier (MEI-87, was a raw Biome parse error)', () => {
    const wideDeps = new Set(['@meith/plugin-dues'])
    expect(() =>
      validateManifest(
        [{ key: 'foo--bar', package: '@meith/plugin-dues', enabled: true }],
        wideDeps,
        MANIFEST_FILE,
      ),
    ).toThrow(/"foo--bar" is a valid plugin key, but the identifier .* is not a valid/)
  })

  it('refuses a key with a trailing hyphen, for the same reason', () => {
    const wideDeps = new Set(['@meith/plugin-dues'])
    expect(() =>
      validateManifest(
        [{ key: 'foo-', package: '@meith/plugin-dues', enabled: true }],
        wideDeps,
        MANIFEST_FILE,
      ),
    ).toThrow(/"foo-" is a valid plugin key, but the identifier community\.plugins\.ts would/)
  })

  it('refuses two keys that collide on the same identifier ("foo-1" and "foo1" both become "foo1", MEI-87, was a Biome noRedeclare error)', () => {
    const wideDeps = new Set(['@meith/plugin-dues', '@meith/plugin-widget'])
    expect(() =>
      validateManifest(
        [
          { key: 'foo-1', package: '@meith/plugin-dues', enabled: true },
          { key: 'foo1', package: '@meith/plugin-widget', enabled: true },
        ],
        wideDeps,
        MANIFEST_FILE,
      ),
    ).toThrow(/"foo1" and "foo-1" both generate the identifier "foo1"/)
  })

  it('refuses a non-boolean "enabled"', () => {
    expect(() => validateManifest([{ ...ENTRY, enabled: 'false' }], deps, MANIFEST_FILE)).toThrow(
      /non-boolean "enabled"/,
    )
    expect(() => validateManifest([{ ...ENTRY, enabled: 0 }], deps, MANIFEST_FILE)).toThrow(
      /non-boolean "enabled"/,
    )
  })

  it('refuses a package name that is not valid npm grammar, before it ever reaches an import specifier', () => {
    const badDeps = new Set(["@meith/plugin-dues'; alert(1); //"])
    expect(() =>
      validateManifest(
        [{ ...ENTRY, package: "@meith/plugin-dues'; alert(1); //" }],
        badDeps,
        MANIFEST_FILE,
      ),
    ).toThrow(/is not a valid npm package name/)
  })
})
