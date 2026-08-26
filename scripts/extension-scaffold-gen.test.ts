import { describe, expect, it } from 'vitest'

import { scaffoldPlugin, scaffoldTheme } from '../packages/create-meith/src/scaffold-extension'
import {
  CAMEL_TOKEN,
  KEY_TOKEN,
  PLUGIN_SUBSTITUTIONS,
  renderTemplatesModule,
  THEME_SUBSTITUTIONS,
  TITLE_TOKEN,
  transformSources,
} from './extension-scaffold-gen.mts'
import { validateEntry } from './marketplace-gen.mjs'

describe('transformSources', () => {
  it('substitutes every anchor it finds', () => {
    const out = transformSources(
      [
        {
          path: 'src/theme.ts',
          contents: "export const irisTheme = defineTheme({ key: 'iris', title: 'Iris' })",
        },
      ],
      THEME_SUBSTITUTIONS,
      /iris/i,
    )
    expect(out[0]?.contents).toBe(
      `export const ${CAMEL_TOKEN}Theme = defineTheme({ key: '${KEY_TOKEN}', title: '${TITLE_TOKEN}' })`,
    )
  })

  it('fails loudly when an anchor stops matching, instead of drifting', () => {
    expect(() =>
      transformSources(
        [{ path: 'src/theme.ts', contents: 'nothing here' }],
        THEME_SUBSTITUTIONS,
        /iris/i,
      ),
    ).toThrow(/matched nothing/)
  })

  it("fails loudly when the example's own name survives substitution", () => {
    expect(() =>
      transformSources(
        [{ path: 'a.ts', contents: 'irisTheme iris Iris IRIS_LEFTOVER' }],
        THEME_SUBSTITUTIONS,
        /iris/i,
      ),
    ).toThrow(/still contains/)
  })

  it('carries the plugin substitution list the generated module was built with', () => {
    expect(PLUGIN_SUBSTITUTIONS.length).toBeGreaterThan(0)
  })
})

describe('renderTemplatesModule', () => {
  it('renders both template arrays as plain data', () => {
    const module = renderTemplatesModule(
      [{ path: 'src/plugin.tsx', contents: 'a' }],
      [{ path: 'src/theme.ts', contents: 'b' }],
    )
    expect(module).toContain('PLUGIN_TEMPLATES')
    expect(module).toContain('THEME_TEMPLATES')
    expect(module).toContain('"src/plugin.tsx"')
  })
})

describe('the pre-filled listings', () => {
  it.each([
    ['plugin', scaffoldPlugin({ name: 'my-tools', version: '0.21.2' })],
    ['theme', scaffoldTheme({ name: 'sunset-glow', version: '0.21.2' })],
  ] as const)('the %s listing passes the marketplace validator', (_kind, files) => {
    const entry = JSON.parse(files.get('listing.json') ?? 'null')
    expect(validateEntry('listing.json', entry)).toEqual([])
  })
})
