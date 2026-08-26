import { describe, expect, it } from 'vitest'

import { commentLines } from './comment-scan.mjs'

const count = (source: string): number => commentLines(source).size

describe('commentLines', () => {
  it('counts a line comment and a block comment', () => {
    expect(count('const a = 1 // why')).toBe(1)
    expect(count('/* why */')).toBe(1)
    expect(count('/**\n * one\n * two\n */')).toBe(2)
  })

  it('reports the line each comment sits on', () => {
    const found = commentLines('const a = 1\nconst b = 2 // second\n')
    expect([...found.keys()]).toEqual([2])
    expect(found.get(2)).toBe('second')
  })

  it('does not read a URL in a string as a comment', () => {
    expect(count(`const url = 'https://example.com/a//b'`)).toBe(0)
    expect(count(`const url = "https://example.com"`)).toBe(0)
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the string is the source text under test, and it has to carry a template interpolation for the scanner to walk one.
    expect(count('const url = `https://example.com/${id}//x`')).toBe(0)
  })

  it('does not read a slash inside a regex as a comment', () => {
    expect(count(String.raw`const ok = /a\/\/b/.test(value)`)).toBe(0)
    expect(count('const ok = /[/]/.test(value)')).toBe(0)
    expect(count(String.raw`const parts = value.split(/\//)`)).toBe(0)
  })

  it('still finds a comment after a regex or a division', () => {
    expect(count('const ok = /[/]/ // after a character class')).toBe(1)
    expect(count('const ratio = a / b // after a division')).toBe(1)
  })

  it('does not read comment syntax inside a string as a comment', () => {
    expect(count(`const s = '// not a comment'`)).toBe(0)
    expect(count(`const s = '/* not a comment */'`)).toBe(0)
    expect(count(String.raw`const s = 'it\'s // fine'`)).toBe(0)
  })

  it('ignores a shebang', () => {
    expect(count('#!/usr/bin/env node\nconst a = 1\n')).toBe(0)
  })

  it('does not count the directives a suppression needs', () => {
    expect(count('// biome-ignore lint/style/noVar: the reason')).toBe(0)
    expect(count('// @ts-expect-error the reason')).toBe(0)
    expect(count(`/** @type {import('x').Y} */`)).toBe(0)
    expect(count('/// <reference types="x" />')).toBe(0)
  })

  it('counts a JSDoc block that explains rather than annotates', () => {
    expect(count('/** Explains what the function is for. */')).toBe(1)
  })

  it('ignores an empty comment', () => {
    expect(count('//')).toBe(0)
    expect(count('/**\n *\n */')).toBe(0)
  })

  it('counts a comment inside a template expression', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: same reason — the interpolation is what puts the scanner back into code, which is the case this covers.
    expect(count('const s = `a${b // why\n}c`')).toBe(1)
  })
})
