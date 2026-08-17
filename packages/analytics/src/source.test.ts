import { describe, expect, it } from 'vitest'

import { DIRECT_SOURCE, INTERNAL_SOURCE, isExternalSource, viewSource } from './source'

describe('viewSource', () => {
  it('calls a visit with no referrer direct', () => {
    expect(viewSource({ referrer: null, boardHost: 'forum.example' })).toBe(DIRECT_SOURCE)
    expect(viewSource({ referrer: '  ', boardHost: 'forum.example' })).toBe(DIRECT_SOURCE)
  })

  it('names the external host, without www', () => {
    expect(
      viewSource({ referrer: 'https://www.Example.com/a/b', boardHost: 'forum.example' }),
    ).toBe('example.com')
  })

  it('separates a link from the board itself', () => {
    expect(
      viewSource({ referrer: 'https://forum.example/12-general', boardHost: 'forum.example' }),
    ).toBe(INTERNAL_SOURCE)
    expect(
      viewSource({ referrer: 'https://www.forum.example/', boardHost: 'forum.example' }),
    ).toBe(INTERNAL_SOURCE)
    expect(
      viewSource({ referrer: 'https://cdn.forum.example/', boardHost: 'forum.example' }),
    ).toBe(INTERNAL_SOURCE)
  })

  it('falls back to direct for anything unparseable or off the web', () => {
    for (const referrer of ['not a url', 'android-app://com.example', 'javascript:1']) {
      expect(viewSource({ referrer, boardHost: 'forum.example' }), referrer).toBe(
        DIRECT_SOURCE,
      )
    }
  })

  it('counts an external host when the board does not know its own address', () => {
    expect(viewSource({ referrer: 'https://news.example/', boardHost: null })).toBe(
      'news.example',
    )
  })

  it('tells the two bookkeeping sources from a real one', () => {
    expect(isExternalSource(DIRECT_SOURCE)).toBe(false)
    expect(isExternalSource(INTERNAL_SOURCE)).toBe(false)
    expect(isExternalSource('example.com')).toBe(true)
  })
})
