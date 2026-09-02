import { describe, expect, it } from 'vitest'

import {
  type Edit,
  fenceEdit,
  imageEdit,
  linkEdit,
  spoilerEdit,
  tableEdit,
  togglePrefix,
  toggleWrap,
} from './editor'

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
  const start = marked.indexOf('‹')
  const end = marked.indexOf('›') - 1
  const value = marked.replace('‹', '').replace('›', '')
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
  })

  it('adds italic inside bold rather than stealing one of its asterisks', () => {
    const out = press('**‹word›**', (v, s, e) => toggleWrap(v, s, e, ITALIC))
    expect(out?.text).toBe('***word***')
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
})

describe('fenced code', () => {
  it('fences the selected lines, never indents them', () => {
    const out = press('‹a < b›', (v, s, e) => fenceEdit(v, s, e))
    expect(out?.text).toBe('```\na < b\n```')
  })
})

describe('spoilers', () => {
  it('wraps the selected lines in a spoiler directive, never indents them', () => {
    const out = press('‹the ending›', (v, s, e) => spoilerEdit(v, s, e, 'hidden text'))
    expect(out?.text).toBe(':::spoiler\nthe ending\n:::')
  })

  it('inserts a placeholder and selects it when nothing is selected', () => {
    const out = press('‹›', (v, s, e) => spoilerEdit(v, s, e, 'hidden text'))
    expect(out?.text).toBe(':::spoiler\nhidden text\n:::')
    expect(out?.selected).toBe('hidden text')
  })
})

describe('images', () => {
  it('inserts a placeholder alt and puts the caret on the URL when nothing is selected', () => {
    const out = press('‹›', (v, s, e) => imageEdit(v, s, e, 'alt text'))
    expect(out?.text).toBe('![alt text](url)')
    expect(out?.selected).toBe('url')
  })

  it('wraps a selection as the alt text and puts the caret on the URL', () => {
    const out = press('‹the logo›', (v, s, e) => imageEdit(v, s, e, 'alt text'))
    expect(out?.text).toBe('![the logo](url)')
    expect(out?.selected).toBe('url')
  })

  it('inserts around a caret in the middle of a word', () => {
    const out = press('a‹b›c', (v, s, e) => imageEdit(v, s, e, 'alt text'))
    expect(out?.text).toBe('a![b](url)c')
    expect(out?.selected).toBe('url')
  })
})

describe('tables', () => {
  it('inserts a 2×2 skeleton and selects the first header cell when nothing is selected', () => {
    const out = press('‹›', (v, s, e) => tableEdit(v, s, e, 'Heading'))
    expect(out?.text).toBe('| Heading | Heading |\n| --- | --- |\n|  |  |')
    expect(out?.selected).toBe('Heading')
  })

  it('replaces a selection with the skeleton, first header cell selected', () => {
    const out = press('‹draft›', (v, s, e) => tableEdit(v, s, e, 'Heading'))
    expect(out?.text).toBe('| Heading | Heading |\n| --- | --- |\n|  |  |')
    expect(out?.selected).toBe('Heading')
  })

  it('starts the block on its own line from a caret mid-line, keeping the trailing text', () => {
    const out = press('hel‹›lo', (v, s, e) => tableEdit(v, s, e, 'Heading'))
    expect(out?.text).toBe('hel\n| Heading | Heading |\n| --- | --- |\n|  |  |\nlo')
    expect(out?.selected).toBe('Heading')
  })
})

describe('task lists', () => {
  it('marks an empty line with an unchecked box', () => {
    expect(press('‹›', (v, s, e) => togglePrefix(v, s, e, '- [ ] '))?.text).toBe('- [ ] ')
  })

  it('marks a selected line, and unmarks it when pressed again', () => {
    expect(press('‹take out the bins›', (v, s, e) => togglePrefix(v, s, e, '- [ ] '))?.text).toBe(
      '- [ ] take out the bins',
    )
    expect(
      press('‹- [ ] take out the bins›', (v, s, e) => togglePrefix(v, s, e, '- [ ] '))?.text,
    ).toBe('take out the bins')
  })

  it('marks the whole line from a caret inside it', () => {
    expect(press('ta‹s›k', (v, s, e) => togglePrefix(v, s, e, '- [ ] '))?.text).toBe('- [ ] task')
  })
})
