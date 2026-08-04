import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Button } from './button'
import { buttonVariants } from './variants'

/**
 * The one thing about this component that can break a board silently.
 *
 * Base UI's `useButton` merges `{ type: 'button' }` into every native button it
 * renders, and a `<button type="button">` inside a `<form>` **does not submit
 * it**. Every form on this board is a native form that must work with
 * JavaScript disabled (R5), so a release of `@base-ui/react` that changed the
 * merge order would turn "Sign in", "Post reply" and every admin save into
 * controls that do nothing for anybody with scripting off — and nothing else
 * would fail. The page renders, the button is there, and the click goes
 * nowhere.
 *
 * It happens to be right today: an explicit `type` wins. This is here so that
 * "happens to be" becomes "is checked", because the failure has no other
 * symptom and no other test could see it.
 */
describe('Button', () => {
  it('keeps an explicit type, so a submit still submits', () => {
    const html = renderToStaticMarkup(
      createElement('form', null, createElement(Button, { type: 'submit' }, 'Post reply')),
    )

    expect(html).toContain('type="submit"')
    expect(html).not.toContain('type="button"')
  })

  it('is a real <button> by default', () => {
    const html = renderToStaticMarkup(createElement(Button, null, 'Go'))
    expect(html).toMatch(/^<button/)
  })

  /**
   * The island and the server slot have to look the same.
   *
   * A theme puts `buttonVariants(...)` on an `<a>`; a form island renders
   * `<Button>`. If those two ever stop producing the same appearance, the board
   * grows two kinds of button that differ by whether the control happened to
   * need JavaScript — which is the least meaningful axis a design could vary on.
   *
   * Asserted on the variant and size classes rather than on the whole string:
   * `cn` runs the recipe through tailwind-merge, so the base `gap-2` is dropped
   * by `size="sm"`'s `gap-1.5` and a whole-string comparison would be a test of
   * tailwind-merge.
   */
  it('carries the shared recipe, so an island and a server slot match', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { variant: 'primary' as const, size: 'sm' as const }, 'Go'),
    )

    for (const cls of ['bg-primary', 'text-primary-foreground', 'h-8', 'text-xs']) {
      expect(html, `${cls} is in buttonVariants({ variant: 'primary', size: 'sm' })`).toContain(cls)
      expect(buttonVariants({ variant: 'primary', size: 'sm' })).toContain(cls)
    }
  })
})
