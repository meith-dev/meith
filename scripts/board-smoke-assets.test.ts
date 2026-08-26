import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  classesInMarkup,
  PACKAGE_WITNESS_CLASSES,
  unresolvedMessageKeys,
  unstyledClasses,
} from './board-smoke-assets.mts'

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

  /**
   * The shapes that turned a correct board red: a class attribute is HTML, so
   * `[&_svg]:shrink-0` arrives as `[&amp;_svg]:shrink-0` and each quote in
   * `[class*='size-']` as `&#x27;`. Read raw, they name a selector that cannot
   * exist in any stylesheet.
   */
  it('decodes the entities an arbitrary variant is written with', () => {
    expect(classesInMarkup('<i class="[&amp;_svg]:shrink-0">x</i>')).toEqual(['[&_svg]:shrink-0'])
  })

  it('decodes numeric character references too', () => {
    expect(
      classesInMarkup(`<i class="[&amp;_svg:not([class*=&#x27;size-&#x27;])]:size-4">x</i>`),
    ).toEqual(["[&_svg:not([class*='size-'])]:size-4"])
  })

  it('finds the rule Tailwind emits for a decoded arbitrary variant', () => {
    const html = '<i class="[&amp;:not(:first-child)]:border-l">x</i>'
    const css =
      '.\\[\\&\\:not\\(\\:first-child\\)\\]\\:border-l:not(:first-child){border-left-width:1px}'

    expect(unstyledClasses(html, css)).toEqual([])
  })

  it('reads every class attribute on the page, not just the first', () => {
    expect(classesInMarkup('<a class="one">x</a><b class="two three">y</b>')).toEqual([
      'one',
      'three',
      'two',
    ])
  })
})

describe('the witnesses that prove the installed packages were scanned', () => {
  function sourceOf(dir: string): string {
    const root = new URL(dir, import.meta.url)
    return readdirSync(root, { recursive: true })
      .filter((name) => typeof name === 'string' && /\.tsx?$/.test(name))
      .map((name) => readFileSync(new URL(`${dir}/${name}`, import.meta.url), 'utf8'))
      .join('\n')
  }

  const inPackages = `${sourceOf('../packages/ui/src')}\n${sourceOf('../themes/default/src')}`
  const inApp = `${sourceOf('../apps/community/src')}\n${sourceOf('../apps/community/app')}`

  it('has enough of them that one deletion does not empty the gate', () => {
    expect(PACKAGE_WITNESS_CLASSES.length).toBeGreaterThanOrEqual(3)
  })

  it.each(PACKAGE_WITNESS_CLASSES)('%s is a class the installed packages produce', (className) => {
    expect(inPackages).toContain(className)
  })

  /**
   * The board's own app source is materialized and scanned either way. A
   * witness it also uses would have a rule in the broken build too, and prove
   * nothing about the packages.
   */
  it.each(PACKAGE_WITNESS_CLASSES)('%s is one the app cannot supply by itself', (className) => {
    expect(inApp).not.toContain(className)
  })
})
