/**
 * F36 — the tree, and the two rules that keep it honest: never emit unbalanced
 * markup, and never let an unclosed tag run away with the rest of the post.
 */
import { describe, expect, it } from 'vitest'

import { textOf, type BBNode } from './ast'
import { parse } from './parse'

/** A compact readable form, so a failure shows the shape rather than a blob. */
function sketch(nodes: readonly BBNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') return JSON.stringify(node.value)
      if (node.kind === 'raw') return `${node.tag}!{${JSON.stringify(node.value)}}`
      const attribute = node.attribute === null ? '' : `=${node.attribute}`
      return `${node.tag}${attribute}(${sketch(node.children)})`
    })
    .join(' ')
}

describe('parse', () => {
  it('nests elements', () => {
    expect(sketch(parse('[b]bold [i]both[/i][/b]').nodes)).toBe('b("bold " i("both"))')
  })

  it('keeps an unknown tag as text', () => {
    expect(sketch(parse('[blink]x[/blink]').nodes)).toBe('"[blink]x[/blink]"')
  })

  it('keeps a closing tag that closes nothing as text', () => {
    expect(sketch(parse('x[/b]y').nodes)).toBe('"x[/b]y"')
  })

  it('takes a raw tag body verbatim', () => {
    expect(sketch(parse('[code][b]x[/b][/code]').nodes)).toBe('code!{"[b]x[/b]"}')
  })

  describe('malformed nesting', () => {
    /*
     * The rule that makes unbalanced output impossible. `[i]` is closed
     * implicitly by `[/b]`, exactly as an HTML parser would, so the renderer is
     * never handed a shape whose output could leak past the post.
     */
    it('implicitly closes intervening tags when a matching open exists', () => {
      expect(sketch(parse('[b][i]x[/b]y').nodes)).toBe('b(i("x")) "y"')
    })

    /*
     * The other half. An open tag with no close is *demoted* — the tag becomes
     * the text it looks like and its children stay where they were written.
     * Closing it implicitly instead would mean one stray `[b]` bolds every word
     * after it, including other people's replies once the page is assembled.
     */
    it('demotes a tag left open at the end to text', () => {
      expect(sketch(parse('[b]bold').nodes)).toBe('"[b]" "bold"')
    })

    it('demotes only the unclosed tag, keeping what closed properly', () => {
      expect(sketch(parse('[b]a[i]b[/i]c').nodes)).toBe('"[b]" "a" i("b") "c"')
    })

    it('loses no text in either case', () => {
      for (const source of ['[b]a[i]b[/b]c', '[b]a[i]b[/i]', '[/u]a[b]']) {
        expect(textOf(parse(source).nodes).replace(/\[\/?[a-z*]+\]/g, '')).toBe(
          source.replace(/\[\/?[a-z*]+\]/g, ''),
        )
      }
    })
  })

  describe('lists', () => {
    it('builds items and drops the whitespace between them', () => {
      expect(sketch(parse('[list]\n[*]one\n[*]two\n[/list]').nodes)).toBe(
        'list(*("one\\n") *("two\\n"))',
      )
    })

    it('gives stray content before the first item its own item', () => {
      expect(sketch(parse('[list]loose[*]one[/list]').nodes)).toBe('list(*("loose") *("one"))')
    })

    it('keeps an item outside a list as text', () => {
      expect(sketch(parse('[*]orphan').nodes)).toBe('"[*]orphan"')
    })

    it('supports the ordered form', () => {
      expect(sketch(parse('[list=1][*]a[/list]').nodes)).toBe('list=1(*("a"))')
    })
  })

  describe('limits', () => {
    it('keeps a tag past the depth limit as text', () => {
      const source = '[b][b][b]deep[/b][/b][/b]'
      const document = parse(source, { limits: { maxDepth: 2 } })
      expect(sketch(document.nodes)).toBe('b(b("[b]deep")) "[/b]"')
    })

    it('renders the tail as text once the node budget is spent, losing nothing', () => {
      const source = '[b]a[/b][i]b[/i][u]c[/u]'
      const document = parse(source, { limits: { maxNodes: 3 } })
      expect(document.truncated).toBe(true)
      expect(sketch(document.nodes)).toBe('b("a") "[i]" "b[/i][u]c[/u]"')
    })

    it('flags an over-long body but still carries every character', () => {
      const source = `[b]${'x'.repeat(50)}[/b]`
      const document = parse(source, { limits: { maxInput: 10 } })
      expect(document.truncated).toBe(true)
      expect(textOf(document.nodes)).toContain('x'.repeat(50))
    })

    /*
     * The limits exist so a hostile body cannot make the parser the slow part
     * of a page. Deeply nested and heavily bracketed inputs are the two shapes
     * that historically do it.
     */
    it('parses pathological input quickly', () => {
      const started = Date.now()
      parse('[b]'.repeat(20_000))
      parse('['.repeat(50_000))
      parse('[quote=x]'.repeat(10_000))
      expect(Date.now() - started).toBeLessThan(2_000)
    })
  })
})
