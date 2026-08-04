import { describe, expect, it } from 'vitest'

import { renderBBCode } from './body'
import { compileSmilies, createTagRegistry, restrictTagRegistry } from './extensions'

describe('BBCode extensions', () => {
  it('renders custom tags from a fixed element shape, never an admin template', () => {
    const tags = createTagRegistry([{ name: 'notice', block: false }])
    expect(renderBBCode('[notice]<b>Read</b>[/notice]', { tags }).html).toBe(
      '<span class="bb-custom bb-custom-notice">&lt;b&gt;Read&lt;/b&gt;</span>',
    )
  })

  it('refuses invalid names and attempts to replace built-in tags', () => {
    expect(() => createTagRegistry([{ name: 'bad-name', block: false }])).toThrow(/names use/)
    expect(() => createTagRegistry([{ name: 'url', block: false }])).toThrow(/already exists/)
  })

  it('leaves disabled tags as source text, while preserving list items for an enabled list', () => {
    const tags = restrictTagRegistry(createTagRegistry([{ name: 'note', block: false }]), ['list'])
    expect(renderBBCode('[note]x[/note] [list][*]y[/list]', { tags }).html).toBe(
      '[note]x[/note] <ul class="bb-list"><li>y</li></ul>',
    )
  })

  it('renders literal smileys, choosing the longest matching code', () => {
    const smilies = compileSmilies([
      { code: ':)', src: '/smilies/smile.png' },
      { code: ':-)', src: 'https://cdn.example.test/grin.png', alt: 'grin' },
    ])
    expect(renderBBCode(':-) :)', { smilies }).html).toBe(
      '<img src="https://cdn.example.test/grin.png" alt="grin" loading="lazy" class="bb-smiley"> <img src="/smilies/smile.png" alt=":)" loading="lazy" class="bb-smiley">',
    )
  })

  it('does not expand smileys inside code and rejects unsafe image sources', () => {
    const smilies = compileSmilies([{ code: ':)', src: '/smilies/smile.png' }])
    expect(renderBBCode('[code]:)[/code]', { smilies }).html).toContain('<code>:)</code>')
    expect(() => compileSmilies([{ code: ':)', src: 'javascript:alert(1)' }])).toThrow(/unsafe/)
  })
})
