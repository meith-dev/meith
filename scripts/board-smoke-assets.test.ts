import { describe, expect, it } from 'vitest'

import { unresolvedMessageKeys } from './board-smoke-assets.mts'

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
