import { describe, expect, it } from 'vitest'

import type { FilterHandler } from '@meith/plugin-kit'

import { helloPlugin } from './plugin'

describe('the hello plugin', () => {
  it('has a validated manifest (definePlugin threw at import time otherwise)', () => {
    expect(helloPlugin.key).toBe('hello')
    expect(helloPlugin.version).toBe('0.1.0')
  })

  it('appends its footer link without disturbing the board’s own', () => {
    const filter = helloPlugin.hooks?.['view.footer'] as FilterHandler<'view.footer'>
    const footer = {
      boardTitle: 'A board',
      links: [{ label: 'Contact', href: '/contact' }],
      timezoneLabel: 'Europe/Dublin',
    }

    const filtered = filter(footer, { userId: null, isGuest: true, requestId: null })

    expect(filtered).toMatchObject({
      boardTitle: 'A board',
      links: [
        { label: 'Contact', href: '/contact' },
        { label: 'Hello plugin', href: expect.stringContaining('examples/hello-plugin') },
      ],
    })
    expect(footer.links).toHaveLength(1)
  })
})
