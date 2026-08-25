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

  it('leaves the default materialization depth exactly as it found it', () => {
    const css = ['@source "../../../../themes";', '@source "../../../../packages/ui/src";'].join(
      '\n',
    )

    expect(rebaseGlobalsCssSources(css, '/board/.meith/app/src/styles', '/board')).toBe(css)
  })

  it('rebases against the board root when the app is materialized there', () => {
    const css = ['@source "../../../../themes";', '@source "../../../../packages/ui/src";'].join(
      '\n',
    )

    const rewritten = rebaseGlobalsCssSources(css, '/board/src/styles', '/board')

    expect(rewritten).toContain('@source "../../themes";')
    expect(rewritten).toContain('@source "../../packages/ui/src";')
  })

  it('is a no-op for a file with no @source lines', () => {
    const css = '@import "tailwindcss";\n.foo { color: red; }\n'
    expect(rebaseGlobalsCssSources(css, '/repo/boards/stock/.meith/app/src/styles', '/repo')).toBe(
      css,
    )
  })
})
