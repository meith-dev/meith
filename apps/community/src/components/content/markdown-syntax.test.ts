import { describe, expect, it } from 'vitest'

import type { Edit } from '@meith/theme-kit'

import { listContinuation, pasteAsLink } from './markdown-syntax'

function applied(value: string, edit: Edit): { text: string; selected: string } {
  const text = value.slice(0, edit.from) + edit.text + value.slice(edit.to)
  return { text, selected: text.slice(edit.selectionStart, edit.selectionEnd) }
}

function press(
  marked: string,
  run: (value: string, start: number, end: number) => Edit | null,
): { text: string; selected: string } | null {
  const start = marked.indexOf('‹')
  const end = marked.indexOf('›') - 1
  const value = marked.replace('‹', '').replace('›', '')
  const edit = run(value, start, end)
  return edit === null ? null : applied(value, edit)
}

describe('links', () => {
  it('turns a URL pasted over words into a link around them', () => {
    const out = press('see ‹the docs›', (v, s, e) => pasteAsLink(v, s, e, 'https://x.test'))
    expect(out?.text).toBe('see [the docs](https://x.test)')
  })

  it('leaves an ordinary paste alone', () => {
    expect(press('‹words›', (v, s, e) => pasteAsLink(v, s, e, 'not a url'))).toBeNull()
    expect(
      press('nothing selected‹›', (v, s, e) => pasteAsLink(v, s, e, 'https://x.test')),
    ).toBeNull()
  })
})

describe('Return inside a list', () => {
  it('continues a bullet', () => {
    expect(press('- one‹›', (v, s) => listContinuation(v, s))?.text).toBe('- one\n- ')
  })

  it('continues a numbered list, counting up', () => {
    expect(press('3. three‹›', (v, s) => listContinuation(v, s))?.text).toBe('3. three\n4. ')
  })

  it('continues a quote', () => {
    expect(press('> quoted‹›', (v, s) => listContinuation(v, s))?.text).toBe('> quoted\n> ')
  })

  it('keeps the indentation of a nested item', () => {
    expect(press('  - inner‹›', (v, s) => listContinuation(v, s))?.text).toBe('  - inner\n  - ')
  })

  it('continues a finished task as an unfinished one', () => {
    expect(press('- [x] done‹›', (v, s) => listContinuation(v, s))?.text).toBe('- [x] done\n- [ ] ')
  })

  it('ends the list when Return lands on an empty item', () => {
    expect(press('- one\n- ‹›', (v, s) => listContinuation(v, s))?.text).toBe('- one\n')
  })

  it('does nothing on an ordinary line', () => {
    expect(press('just a sentence‹›', (v, s) => listContinuation(v, s))).toBeNull()
  })
})
