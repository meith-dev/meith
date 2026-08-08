/**
 * What an example plugin should assert about itself.
 *
 * The host's behaviour — isolation, ordering, auto-disable — is covered by
 * `@meith/plugin-kit`'s own suite and by `plugins/reference`. A plugin's test
 * belongs to the plugin's *own* claims: that its manifest validates, and that
 * its filters transform a value the way the plugin promises to.
 */
import type { FilterHandler } from '@meith/plugin-kit'
import { describe, expect, it } from 'vitest'

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
    /* A filter returns a new value; it must not mutate what it was handed. */
    expect(footer.links).toHaveLength(1)
  })
})
