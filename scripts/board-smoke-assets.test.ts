import { describe, expect, it } from 'vitest'

import { classesInMarkup, unresolvedMessageKeys, unstyledClasses } from './board-smoke-assets.mts'

const KEYS = ['default.latestThreads.heading', 'default.shell.skipToContent']

describe('the keys a rendered board failed to turn into text', () => {
  it('finds a heading that stayed a key, which is what a missing catalog looks like', () => {
    const html = '<h2 class="heading">default.latestThreads.heading</h2>'

    expect(unresolvedMessageKeys(html, KEYS)).toEqual(['default.latestThreads.heading'])
  })

  it('reports every distinct key once, in a stable order', () => {
    const html = [
      '<a>default.shell.skipToContent</a>',
      '<h2>default.latestThreads.heading</h2>',
      '<a>default.shell.skipToContent</a>',
    ].join('')

    expect(unresolvedMessageKeys(html, KEYS)).toEqual([
      'default.latestThreads.heading',
      'default.shell.skipToContent',
    ])
  })

  it('leaves a board that rendered its text alone', () => {
    const html = '<h2>Latest threads</h2><a>Skip to content</a><p>Powered by Meith</p>'

    expect(unresolvedMessageKeys(html, KEYS)).toEqual([])
  })

  it('does not mistake the dotted values a working board renders for keys', () => {
    const html = [
      '<a>meith-final.vercel.app</a>',
      '<span>0.20.0</span>',
      '<time>Europe/Dublin</time>',
      '<code>community.config.ts</code>',
    ].join('')

    expect(unresolvedMessageKeys(html, KEYS)).toEqual([])
  })

  it('reads a catalog shipped to the client as data, not as text that failed to resolve', () => {
    const html = '<script>{"default.shell.skipToContent":"Skip to content"}</script>'

    expect(unresolvedMessageKeys(html, KEYS)).toEqual([])
  })

  it('holds the theme catalog it is guarding, so the key names cannot go stale', async () => {
    const { defaultMessages } = await import('@meith/theme-default')

    for (const key of KEYS) expect(Object.keys(defaultMessages.en!)).toContain(key)
  })
})

describe('the classes a served stylesheet has no rule for', () => {
  const ALERT =
    '<div class="rounded-md border-l-4 border-l-moderation-pending bg-card">' +
    '<strong class="font-medium">Mail</strong></div>'

  it('names every class when the stylesheet is only the preflight', () => {
    expect(unstyledClasses(ALERT, '*, ::before { box-sizing: border-box; }')).toEqual([
      'bg-card',
      'border-l-4',
      'border-l-moderation-pending',
      'font-medium',
      'rounded-md',
    ])
  })

  it('is silent when every class it rendered has a rule', () => {
    const css = [
      '.rounded-md { border-radius: .375rem }',
      '.border-l-4 { border-left-width: 4px }',
      '.border-l-moderation-pending { border-left-color: gold }',
      '.bg-card { background: white }',
      '.font-medium { font-weight: 500 }',
    ].join('\n')

    expect(unstyledClasses(ALERT, css)).toEqual([])
  })

  /**
   * `.border` must not be answered by `.border-l-4`, or a stylesheet missing
   * the very rules this looks for would satisfy it by prefix.
   */
  it('does not let a longer class answer for a shorter one', () => {
    expect(
      unstyledClasses('<i class="border">x</i>', '.border-l-4 { border-left-width: 4px }'),
    ).toEqual(['border'])
  })

  it('reads the escaped selectors Tailwind writes for variants and opacities', () => {
    const html = '<i class="bg-destructive/5 after:absolute bg-[inherit]">x</i>'
    const css = '.bg-destructive\\/5{}.after\\:absolute::after{}.bg-\\[inherit\\]{}'

    expect(unstyledClasses(html, css)).toEqual([])
  })

  it('ignores the marker classes that exist to be selected against, not styled', () => {
    expect(classesInMarkup('<i class="group peer group/row dark">x</i>')).toEqual([])
  })

  it('reads every class attribute on the page, not just the first', () => {
    expect(classesInMarkup('<a class="one">x</a><b class="two three">y</b>')).toEqual([
      'one',
      'three',
      'two',
    ])
  })
})
