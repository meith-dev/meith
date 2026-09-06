import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { PasswordInput } from './password-input'

it('renders a masked native password field with autocomplete and error associations before hydration', () => {
  const html = renderToStaticMarkup(
    createElement(PasswordInput, {
      id: 'current-password',
      name: 'password',
      autoComplete: 'current-password',
      required: true,
      'aria-invalid': true,
      'aria-describedby': 'password-error',
      showLabel: 'Show password',
      hideLabel: 'Hide password',
    }),
  )
  expect(html).toContain('type="password"')
  expect(html).toContain('name="password"')
  expect(html).toContain('autoComplete="current-password"')
  expect(html).toContain('aria-describedby="password-error"')
  expect(html).toContain('aria-invalid="true"')
  expect(html).not.toContain('<button')
})
