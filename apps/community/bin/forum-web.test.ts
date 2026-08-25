import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// @ts-expect-error forum-web.mjs ships untyped, imported directly for its pure export
import { rebaseGlobalsCssSources } from './forum-web.mjs'

describe('rebaseGlobalsCssSources', () => {
  it('rebases every @source line against the real workspace root', () => {
    const css = [
      '@import "tailwindcss";',
      '',
      '@source "../../../../themes";',
      '@source "../../../../plugins";',
      '@source "../../../../examples";',
      '@source "../../../../packages/ui/src";',
      '',
      '.foo { color: red; }',
    ].join('\n')

    const cssDir = '/repo/boards/stock/.meith/app/src/styles'
    const workspaceRoot = '/repo'

    const rewritten = rebaseGlobalsCssSources(css, cssDir, workspaceRoot)

    expect(rewritten).toContain('@source "../../../../../../themes";')
    expect(rewritten).toContain('@source "../../../../../../plugins";')
    expect(rewritten).toContain('@source "../../../../../../examples";')
    expect(rewritten).toContain('@source "../../../../../../packages/ui/src";')
    expect(rewritten).toContain('.foo { color: red; }')
  })

  /**
   * Against the real shipped file, not a fixture: this rebase now runs on
   * every materialization including the default one, where it must be a
   * no-op. Every `@source` in that file is written relative to the workspace
   * root, and this only stays a no-op while that holds — a `@source` meaning
   * anything else (`../fonts`, for `src/fonts`) would be silently retargeted
   * at the workspace root, and fails here instead.
   */
  const shippedGlobalsCss = readFileSync(
    new URL('../src/styles/globals.css', import.meta.url),
    'utf8',
  )

  it('leaves the shipped globals.css byte for byte alone at the default depth', () => {
    expect(
      rebaseGlobalsCssSources(shippedGlobalsCss, '/board/.meith/app/src/styles', '/board'),
    ).toBe(shippedGlobalsCss)
  })

  it('rebases every shipped @source against the board root at depth zero', () => {
    const rewritten = rebaseGlobalsCssSources(shippedGlobalsCss, '/board/src/styles', '/board')
    const sources = [...rewritten.matchAll(/@source "([^"]+)";/g)].map((match) => match[1])

    expect(sources.length).toBeGreaterThan(0)
    expect(sources).toContain('../../themes')
    expect(sources).toContain('../../packages/ui/src')
    for (const source of sources) expect(source.startsWith('../../')).toBe(true)
  })

  it('is a no-op for a file with no @source lines', () => {
    const css = '@import "tailwindcss";\n.foo { color: red; }\n'
    expect(rebaseGlobalsCssSources(css, '/repo/boards/stock/.meith/app/src/styles', '/repo')).toBe(
      css,
    )
  })
})
