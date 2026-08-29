import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// @ts-expect-error forum-web.mjs ships untyped, imported directly for its pure export
import { rebaseGlobalsCssSources } from './forum-web.mjs'

const ALL_PRESENT = () => true

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

    const rewritten = rebaseGlobalsCssSources(css, cssDir, workspaceRoot, ALL_PRESENT)

    expect(rewritten).toContain('@source "../../../../../../themes";')
    expect(rewritten).toContain('@source "../../../../../../plugins";')
    expect(rewritten).toContain('@source "../../../../../../examples";')
    expect(rewritten).toContain('@source "../../../../../../packages/ui/src";')
    expect(rewritten).toContain('.foo { color: red; }')
  })

  const shippedGlobalsCss = readFileSync(
    new URL('../src/styles/globals.css', import.meta.url),
    'utf8',
  )

  it('leaves the shipped globals.css byte for byte alone at the default depth', () => {
    expect(
      rebaseGlobalsCssSources(
        shippedGlobalsCss,
        '/board/.meith/app/src/styles',
        '/board',
        ALL_PRESENT,
      ),
    ).toBe(shippedGlobalsCss)
  })

  it('rebases every shipped @source against the board root at depth zero', () => {
    const rewritten = rebaseGlobalsCssSources(
      shippedGlobalsCss,
      '/board/src/styles',
      '/board',
      ALL_PRESENT,
    )
    const sources = [...rewritten.matchAll(/@source "([^"]+)";/g)].map((match) => match[1])

    expect(sources.length).toBeGreaterThan(0)
    expect(sources).toContain('../../themes')
    expect(sources).toContain('../../packages/ui/src')
    for (const source of sources) expect(source.startsWith('../../')).toBe(true)
  })

  it('is a no-op for a file with no @source lines', () => {
    const css = '@import "tailwindcss";\n.foo { color: red; }\n'
    expect(
      rebaseGlobalsCssSources(
        css,
        '/repo/boards/stock/.meith/app/src/styles',
        '/repo',
        ALL_PRESENT,
      ),
    ).toBe(css)
  })

  describe('in a board, where none of those directories exist', () => {
    const inBoard = (path: string) => path.includes('node_modules')

    function sourcesFor(cssDir: string): string[] {
      const rewritten = rebaseGlobalsCssSources(shippedGlobalsCss, cssDir, '/board', inBoard)
      return [...rewritten.matchAll(/@source "([^"]+)";/g)].map((match) => match[1]!)
    }

    it('scans the installed packages, which is where that code actually is', () => {
      expect(sourcesFor('/board/src/styles')).toEqual(['../../node_modules/@meith'])
    })

    it('names no directory that is not there, at either materialization depth', () => {
      for (const sources of [
        sourcesFor('/board/src/styles'),
        sourcesFor('/board/.meith/app/src/styles'),
      ]) {
        for (const source of sources) expect(source).toContain('node_modules/@meith')
      }
    })

    it('leaves the rest of the stylesheet untouched', () => {
      const rewritten = rebaseGlobalsCssSources(
        shippedGlobalsCss,
        '/board/src/styles',
        '/board',
        inBoard,
      )

      expect(rewritten).toContain('@import "tailwindcss";')
      expect(rewritten.replace(/@source "[^"]+";\n/g, '')).toBe(
        shippedGlobalsCss.replace(/@source "[^"]+";\n/g, ''),
      )
    })

    it('keeps a source that is really there, so a hybrid layout loses nothing', () => {
      const present = (path: string) =>
        path.includes('node_modules') || path.endsWith('/board/themes')
      const rewritten = rebaseGlobalsCssSources(
        shippedGlobalsCss,
        '/board/src/styles',
        '/board',
        present,
      )
      const sources = [...rewritten.matchAll(/@source "([^"]+)";/g)].map((match) => match[1])

      expect(sources).toContain('../../themes')
      expect(sources).toContain('../../node_modules/@meith')
    })

    it('adds nothing when the packages are not installed either', () => {
      const rewritten = rebaseGlobalsCssSources(
        shippedGlobalsCss,
        '/board/src/styles',
        '/board',
        () => false,
      )

      expect(rewritten).not.toContain('@source')
    })
  })
})

const BIN = fileURLToPath(new URL('./forum-web.mjs', import.meta.url))

function materializeAtRoot(dir: string) {
  const result = spawnSync(process.execPath, [BIN, 'start', '--at-root'], {
    cwd: dir,
    encoding: 'utf8',
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return {
    output,
    refused: output.includes('refusing to overwrite'),
    materialized: output.includes('no standalone build'),
  }
}

describe('materializing at the workspace root', () => {
  const boards: string[] = []

  afterAll(() => {
    for (const dir of boards) rmSync(dir, { recursive: true, force: true })
  })

  function board(): string {
    const dir = mkdtempSync(join(tmpdir(), 'forum-web-at-root-'))
    writeFileSync(join(dir, 'meith.config.ts'), 'export default {}\n')
    writeFileSync(join(dir, 'meith.plugins.ts'), 'export const INSTALLED_PLUGINS = []\n')
    boards.push(dir)
    return dir
  }

  it('writes the app into the workspace root and records every file it wrote', () => {
    const dir = board()

    expect(materializeAtRoot(dir).materialized).toBe(true)

    for (const rel of ['next.config.mjs', 'app', 'src/styles/globals.css', 'public/sw.js']) {
      expect(existsSync(join(dir, rel))).toBe(true)
    }

    const record = JSON.parse(readFileSync(join(dir, '.meith/materialized.json'), 'utf8'))
    expect(record.files).toContain('public/sw.js')
    expect(record.files).toContain('next.config.mjs')
    expect(record.files).toContain('tsconfig.json')
  })

  it('leaves a board file under a shared directory alone on a second run', () => {
    const dir = board()
    expect(materializeAtRoot(dir).materialized).toBe(true)

    writeFileSync(join(dir, 'public/ads.txt'), 'board-owned\n')
    mkdirSync(join(dir, 'public/.well-known'), { recursive: true })
    writeFileSync(join(dir, 'public/.well-known/thing'), 'verify\n')

    const second = materializeAtRoot(dir)

    expect(second.refused).toBe(false)
    expect(second.materialized).toBe(true)
    expect(readFileSync(join(dir, 'public/ads.txt'), 'utf8')).toBe('board-owned\n')
    expect(readFileSync(join(dir, 'public/.well-known/thing'), 'utf8')).toBe('verify\n')
    expect(existsSync(join(dir, 'public/sw.js'))).toBe(true)
  })

  it('refuses a board file under a name the framework ships, before writing anything', () => {
    const dir = board()
    writeFileSync(join(dir, 'instrumentation.ts'), 'export function register() {}\n')

    const result = materializeAtRoot(dir)

    expect(result.refused).toBe(true)
    expect(result.output).toContain('instrumentation.ts')
    expect(readFileSync(join(dir, 'instrumentation.ts'), 'utf8')).toBe(
      'export function register() {}\n',
    )
    expect(existsSync(join(dir, 'app'))).toBe(false)
    expect(existsSync(join(dir, 'next.config.mjs'))).toBe(false)
  })

  it('proceeds on a fresh checkout whose materialized files are committed', () => {
    const dir = board()
    expect(materializeAtRoot(dir).materialized).toBe(true)

    rmSync(join(dir, '.meith'), { recursive: true, force: true })
    const second = materializeAtRoot(dir)

    expect(second.refused).toBe(false)
    expect(second.materialized).toBe(true)
  })

  it('removes a file it recorded and no longer ships, and nothing else', () => {
    const dir = board()
    expect(materializeAtRoot(dir).materialized).toBe(true)

    const recordPath = join(dir, '.meith/materialized.json')
    const record = JSON.parse(readFileSync(recordPath, 'utf8'))
    writeFileSync(join(dir, 'src/dropped-by-a-release.ts'), 'stale\n')
    writeFileSync(join(dir, 'src/mine.ts'), 'board\n')
    record.files.push('src/dropped-by-a-release.ts')
    writeFileSync(recordPath, JSON.stringify(record))

    expect(materializeAtRoot(dir).materialized).toBe(true)

    expect(existsSync(join(dir, 'src/dropped-by-a-release.ts'))).toBe(false)
    expect(readFileSync(join(dir, 'src/mine.ts'), 'utf8')).toBe('board\n')
  })

  it('warns about a board file under a directory the framework owns outright', () => {
    const dir = board()
    expect(materializeAtRoot(dir).materialized).toBe(true)

    mkdirSync(join(dir, 'app/custom'), { recursive: true })
    writeFileSync(join(dir, 'app/custom/page.tsx'), 'export default () => null\n')

    const second = materializeAtRoot(dir)

    expect(second.refused).toBe(false)
    expect(second.output).toContain('app/custom/page.tsx')
    expect(second.output).toContain("not @meith/web's")
    expect(existsSync(join(dir, 'app/custom/page.tsx'))).toBe(true)
  })
})
