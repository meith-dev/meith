import { describe, expect, it } from 'vitest'

import { renderMarkdown } from '@meith/markdown'

import {
  type Edit,
  fenceEdit,
  linkEdit,
  listContinuation,
  pasteAsLink,
  togglePrefix,
  toggleWrap,
} from './markdown-syntax'

const BOLD = { marker: '*', length: 2, placeholder: 'bold text' }
const ITALIC = { marker: '*', length: 1, placeholder: 'italic text' }
const STRIKE = { marker: '~', length: 2, placeholder: 'struck out' }

function applied(value: string, edit: Edit): { text: string; selected: string } {
  const text = value.slice(0, edit.from) + edit.text + value.slice(edit.to)
  return { text, selected: text.slice(edit.selectionStart, edit.selectionEnd) }
}

function press(
  marked: string,
  run: (value: string, start: number, end: number) => Edit | null,
): { text: string; selected: string } | null {
  const start = marked.indexOf('\u2039')
  const end = marked.indexOf('\u203a') - 1
  const value = marked.replace('\u2039', '').replace('\u203a', '')
  const edit = run(value, start, end)
  return edit === null ? null : applied(value, edit)
}

describe('emphasis, and the collision between bold and italic', () => {
  it('wraps a selection, and unwraps it when pressed again', () => {
    expect(press('‹word›', (v, s, e) => toggleWrap(v, s, e, BOLD))?.text).toBe('**word**')
    expect(press('**‹word›**', (v, s, e) => toggleWrap(v, s, e, BOLD))?.text).toBe('word')
  })

  it('italicises inside a word, which is the whole reason for the asterisk', () => {
    const out = press('con‹cat›enate', (v, s, e) => toggleWrap(v, s, e, ITALIC))
    expect(out?.text).toBe('con*cat*enate')
    expect(renderMarkdown(out?.text ?? '').html).toContain('<em>cat</em>')
  })

  it('adds italic inside bold rather than stealing one of its asterisks', () => {
    const out = press('**‹word›**', (v, s, e) => toggleWrap(v, s, e, ITALIC))
    expect(out?.text).toBe('***word***')
    expect(renderMarkdown(out?.text ?? '').html).toContain('<em><strong>word</strong></em>')
  })

  it('takes bold off something that is bold and italic, and leaves the italic', () => {
    expect(press('***‹word›***', (v, s, e) => toggleWrap(v, s, e, BOLD))?.text).toBe('*word*')
  })

  it('takes italic off something that is bold and italic, and leaves the bold', () => {
    expect(press('***‹word›***', (v, s, e) => toggleWrap(v, s, e, ITALIC))?.text).toBe('**word**')
  })

  it('adds bold to something already italic', () => {
    expect(press('*‹word›*', (v, s, e) => toggleWrap(v, s, e, BOLD))?.text).toBe('***word***')
  })

  it('unwraps when the selection carries its own markers', () => {
    expect(press('‹**word**›', (v, s, e) => toggleWrap(v, s, e, BOLD))?.text).toBe('word')
  })

  it('inserts a placeholder and selects it when there is nothing to wrap', () => {
    const out = press('‹›', (v, s, e) => toggleWrap(v, s, e, ITALIC))
    expect(out?.text).toBe('*italic text*')
    expect(out?.selected).toBe('italic text')
  })

  it('leaves the wrapped words selected, so the next button applies to them', () => {
    expect(press('‹word›', (v, s, e) => toggleWrap(v, s, e, BOLD))?.selected).toBe('word')
    expect(press('**‹word›**', (v, s, e) => toggleWrap(v, s, e, BOLD))?.selected).toBe('word')
  })

  it('handles strikethrough on its own run', () => {
    expect(press('‹word›', (v, s, e) => toggleWrap(v, s, e, STRIKE))?.text).toBe('~~word~~')
    expect(press('~~‹word›~~', (v, s, e) => toggleWrap(v, s, e, STRIKE))?.text).toBe('word')
  })
})

describe('line markers', () => {
  it('marks every selected line, and unmarks when all of them are marked', () => {
    expect(press('‹one\ntwo›', (v, s, e) => togglePrefix(v, s, e, '> '))?.text).toBe('> one\n> two')
    expect(press('‹> one\n> two›', (v, s, e) => togglePrefix(v, s, e, '> '))?.text).toBe('one\ntwo')
  })

  it('marks whole lines from a selection inside one', () => {
    expect(press('some te‹x›t', (v, s, e) => togglePrefix(v, s, e, '> '))?.text).toBe('> some text')
  })

  it('numbers an ordered list down the selection', () => {
    const out = press('‹one\ntwo\nthree›', (v, s, e) =>
      togglePrefix(v, s, e, (index) => `${index + 1}. `),
    )
    expect(out?.text).toBe('1. one\n2. two\n3. three')
  })

  it('marks a line that is still empty', () => {
    expect(press('‹›', (v, s, e) => togglePrefix(v, s, e, '- '))?.text).toBe('- ')
  })
})

describe('links', () => {
  it('puts selected words in the label and the caret on the destination', () => {
    const out = press('‹the docs›', (v, s, e) => linkEdit(v, s, e))
    expect(out?.text).toBe('[the docs](url)')
    expect(out?.selected).toBe('url')
  })

  it('puts a selected URL in the destination and the caret on the label', () => {
    const out = press('‹https://x.test›', (v, s, e) => linkEdit(v, s, e))
    expect(out?.text).toBe('[link text](https://x.test)')
    expect(out?.selected).toBe('link text')
  })

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

describe('fenced code', () => {
  it('fences the selected lines, never indents them', () => {
    const out = press('‹a < b›', (v, s, e) => fenceEdit(v, s, e))
    expect(out?.text).toBe('```\na < b\n```')
    expect(renderMarkdown(out?.text ?? '').html).toContain('a &lt; b')
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
