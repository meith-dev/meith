import { describe, expect, it } from 'vitest'

import { renderMarkdown } from '@meith/markdown'

import { highlightCodeBlocks } from './code-highlighting'

const fenced = (lang: string, code: string): string =>
  renderMarkdown(`\`\`\`${lang}\n${code}\n\`\`\``).html

describe('highlightCodeBlocks', () => {
  it('highlights a recognized language, in both a light and a dark colour', async () => {
    const out = await highlightCodeBlocks(fenced('ts', 'const x = 1'))

    expect(out).toContain('--shiki-light')
    expect(out).toContain('--shiki-dark')
    expect(out).toContain('data-lang="ts"')
    expect(out).toContain('class="md-code-lang-ts"')
    expect(out).toContain('const')
  })

  it('resolves a common alias to its canonical grammar', async () => {
    const out = await highlightCodeBlocks(fenced('js', 'const x = 1'))
    expect(out).toContain('--shiki-light')
  })

  it('leaves a language it does not recognize exactly as the renderer produced it', async () => {
    const rendered = fenced('brainfuck', '++++')
    expect(await highlightCodeBlocks(rendered)).toBe(rendered)
  })

  it('leaves a fenced block with no language untouched', async () => {
    const rendered = renderMarkdown('```\nplain\n```').html
    expect(await highlightCodeBlocks(rendered)).toBe(rendered)
  })

  it('leaves html with no code block untouched, without loading a highlighter', async () => {
    const html = '<p>nothing to highlight here</p>'
    expect(await highlightCodeBlocks(html)).toBe(html)
  })

  it('round-trips characters the renderer escaped, rather than highlighting entities', async () => {
    const out = await highlightCodeBlocks(fenced('ts', 'a < b && b > c'))
    // A double-escape (e.g. `&amp;lt;`) would mean it highlighted the *entities*
    // render.ts produced instead of the original source text.
    expect(out).not.toMatch(/&amp;(lt|gt|amp|#x3C|#x26);/)
    expect(out).toContain('<span')
  })

  it('highlights two identical blocks independently, both correctly', async () => {
    const rendered = `${fenced('ts', 'const x = 1')}${fenced('ts', 'const x = 1')}`
    const out = await highlightCodeBlocks(rendered)
    expect(out.match(/data-lang="ts"/g)).toHaveLength(2)
  })

  it('highlights one block and leaves its unrecognized neighbour alone', async () => {
    const rendered = `${fenced('ts', 'const x = 1')}${fenced('brainfuck', '++++')}`
    const out = await highlightCodeBlocks(rendered)
    expect(out).toContain('data-lang="ts"')
    expect(out).toContain('class="md-code-lang-brainfuck">++++')
  })
})
