import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from './input-otp'

describe('InputOTP', () => {
  it('submits under its field name and lays out one slot per digit', () => {
    const group = createElement(
      InputOTPGroup,
      null,
      [0, 1, 2, 3, 4, 5].map((index) => createElement(InputOTPSlot, { key: index, index })),
    )
    const html = renderToStaticMarkup(
      createElement(InputOTP, {
        name: 'code',
        maxLength: 6,
        autoComplete: 'one-time-code',
        // biome-ignore lint/correctness/noChildrenProp: OTPInput's props type requires `children`, which createElement cannot supply positionally for a required prop
        children: group,
      }),
    )

    expect(html).toContain('name="code"')
    expect(html).toContain('one-time-code')
    expect((html.match(/data-slot="input-otp-slot"/g) ?? []).length).toBe(6)
  })

  it('renders a decorative separator', () => {
    const html = renderToStaticMarkup(createElement(InputOTPSeparator))
    expect(html).toContain('data-slot="input-otp-separator"')
    expect(html).toContain('aria-hidden="true"')
  })
})
