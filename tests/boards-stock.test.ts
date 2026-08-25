/**
 * docker/Dockerfile builds the official image from boards/stock (MEI-76), and
 * the whole point of that workspace is that it reproduces exactly what
 * apps/community's own board config declares — the default theme, the
 * env-gated showcase themes, and the env-gated demo/test plugin spreading —
 * so the demo and e2e boards keep working from the same image. These tests
 * are the drift guard: apps/community's board config changing without the
 * matching boards/stock edit is exactly the failure this catches.
 */
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

  it('community.demo.config.ts is byte-identical — it carries no board-seam import, so nothing should differ', () => {
    expect(read('boards/stock/community.demo.config.ts')).toBe(
      read('apps/community/community.demo.config.ts'),
    )
  })

  it('community.demo.plugins.ts is byte-identical — same env-gated demo/test plugin spreading', () => {
    expect(read('boards/stock/community.demo.plugins.ts')).toBe(
      read('apps/community/community.demo.plugins.ts'),
    )
  })

  it('community.config.ts declares the same theme set and default theme', () => {
    const stock = read('boards/stock/community.config.ts')
    const community = read('apps/community/community.config.ts')

    for (const needle of [
      "key: 'default'",
      "title: 'Default'",
      "defaultTheme: 'default'",
      'SHOWCASE_THEMES',
      'showcaseEnabled()',
      'plugins: INSTALLED_PLUGINS',
    ]) {
      expect(stock, `boards/stock/community.config.ts should contain ${needle}`).toContain(needle)
      expect(community, `apps/community/community.config.ts should contain ${needle}`).toContain(
        needle,
      )
    }
  })

  it('community.config.ts reaches defineForumConfig through @meith/web/config — the seam a board outside this monorepo builds against', () => {
    expect(read('boards/stock/community.config.ts')).toContain("from '@meith/web/config'")
  })
})
