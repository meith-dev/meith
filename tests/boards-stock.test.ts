import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

describe("boards/stock reproduces apps/community's board config", () => {
  it('board.plugins.json manifests match', () => {
    expect(JSON.parse(read('boards/stock/board.plugins.json'))).toEqual(
      JSON.parse(read('apps/community/board.plugins.json')),
    )
  })

  it('meith.demo.config.ts is byte-identical — it carries no board-seam import, so nothing should differ', () => {
    expect(read('boards/stock/meith.demo.config.ts')).toBe(
      read('apps/community/meith.demo.config.ts'),
    )
  })

  it('meith.demo.plugins.ts is byte-identical — same env-gated demo/test plugin spreading', () => {
    expect(read('boards/stock/meith.demo.plugins.ts')).toBe(
      read('apps/community/meith.demo.plugins.ts'),
    )
  })

  it('meith.config.ts declares the same theme set and default theme', () => {
    const stock = read('boards/stock/meith.config.ts')
    const community = read('apps/community/meith.config.ts')

    for (const needle of [
      "key: 'default'",
      "title: 'Default'",
      "defaultTheme: 'default'",
      'SHOWCASE_THEMES',
      'showcaseEnabled()',
      'plugins: INSTALLED_PLUGINS',
    ]) {
      expect(stock, `boards/stock/meith.config.ts should contain ${needle}`).toContain(needle)
      expect(community, `apps/community/meith.config.ts should contain ${needle}`).toContain(needle)
    }
  })

  it('meith.config.ts reaches defineForumConfig through @meith/web/config — the seam a board outside this monorepo builds against', () => {
    expect(read('boards/stock/meith.config.ts')).toContain("from '@meith/web/config'")
  })
})
