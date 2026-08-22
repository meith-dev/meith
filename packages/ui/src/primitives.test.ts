import { createElement, type ElementType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Alert } from './alert'
import { Avatar } from './avatar'
import { Card } from './card'
import { Disclosure } from './disclosure'
import { Field, Input, NativeSelect, Textarea } from './field'
import { Separator } from './separator'

describe('Field', () => {
  it('wires its label, description, and error to the control', () => {
    const html = renderToStaticMarkup(
      createElement(
        Field as ElementType,
        {
          name: 'title',
          label: 'Title',
          description: 'Be specific',
          error: 'Required',
        },
        (control) => createElement(Input, control),
      ),
    )

    expect(html).toContain('for="field-title"')
    expect(html).toContain('id="field-title"')
    expect(html).toContain('aria-describedby="field-title-error field-title-description"')
    expect(html).toContain('aria-invalid="true"')
  })

  it('honors an explicit id and omits absent ARIA relationships', () => {
    const html = renderToStaticMarkup(
      createElement(
        Field as ElementType,
        { id: 'custom', name: 'body', label: 'Body' },
        (control) => createElement(Textarea, control),
      ),
    )
    expect(html).toContain('for="custom"')
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain(' aria-invalid=')
  })

  it('applies defaults and caller overrides to controls', () => {
    expect(renderToStaticMarkup(createElement(Input))).toContain('type="text"')
    expect(
      renderToStaticMarkup(createElement(Input, { type: 'email', className: 'extra' })),
    ).toContain('type="email"')
    expect(renderToStaticMarkup(createElement(NativeSelect, null))).toMatch(/^<select/)
  })
})

describe('semantic primitives', () => {
  it('gives error alerts an assertive role and permits role overrides', () => {
    expect(renderToStaticMarkup(createElement(Alert, { tone: 'error' }))).toContain('role="alert"')
    expect(renderToStaticMarkup(createElement(Alert, { role: 'log' }))).toContain('role="log"')
  })

  it('renders avatar fallbacks and privacy-safe images', () => {
    expect(renderToStaticMarkup(createElement(Avatar, { name: ' åsa ' }))).toContain('Å')
    const image = renderToStaticMarkup(
      createElement(Avatar, { name: 'A', src: '/avatar.png', size: 24 }),
    )
    expect(image).toContain('alt=""')
    expect(image).toContain('referrerPolicy="no-referrer"')
    expect(image).toContain('width="24"')
  })

  it('supports card element selection and disclosure structure', () => {
    expect(renderToStaticMarkup(createElement(Card, { as: 'article' }))).toMatch(/^<article/)
    const disclosure = renderToStaticMarkup(
      createElement(Disclosure as ElementType, { summary: 'Details', aside: '2' }, 'Content'),
    )
    expect(disclosure).toMatch(/^<details/)
    expect(disclosure).toContain('<summary')
    expect(disclosure).toContain('aria-hidden="true"')
  })

  it('distinguishes decorative and semantic separators', () => {
    expect(renderToStaticMarkup(createElement(Separator))).toContain('aria-hidden="true"')
    const vertical = renderToStaticMarkup(
      createElement(Separator, { decorative: false, orientation: 'vertical' }),
    )
    expect(vertical).toContain('role="separator"')
    expect(vertical).toContain('aria-orientation="vertical"')
  })
})
