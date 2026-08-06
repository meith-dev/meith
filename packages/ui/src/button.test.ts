import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Button } from './button'
import { buttonVariants } from './variants'

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
