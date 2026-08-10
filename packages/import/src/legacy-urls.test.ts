import { describe, expect, it } from 'vitest'

import { legacyRedirectPath, resolveLegacyUrl, type LegacyTarget } from './legacy-urls'

const resolve = (url: string): LegacyTarget | null => {
  const [pathname, search = ''] = url.split('?')
  return resolveLegacyUrl(pathname!, search)
}

describe('the script forms', () => {
  it.each([
    ['/showthread.php?tid=91', { kind: 'thread', legacyId: 91, postId: null, page: null }],
    ['/showthread.php?tid=91&page=3', { kind: 'thread', legacyId: 91, postId: null, page: 3 }],
    [
      '/showthread.php?tid=91&pid=4102',
      { kind: 'thread', legacyId: 91, postId: 4102, page: null },
    ],
    ['/forumdisplay.php?fid=3', { kind: 'forum', legacyId: 3, page: null }],
    ['/forumdisplay.php?fid=3&page=2', { kind: 'forum', legacyId: 3, page: 2 }],
    ['/member.php?uid=12', { kind: 'user', legacyId: 12 }],
    ['/index.php', { kind: 'home' }],
    ['/', { kind: 'home' }],
  ])('resolves %s', (url, expected) => {
    expect(resolve(url)).toEqual(expected)
  })

  it('resolves a bare post id to a post', () => {
    expect(resolve('/showthread.php?pid=4102')).toEqual({ kind: 'post', legacyId: 4102 })
  })

  it('ignores the extra parameters MyBB links carry', () => {
    expect(resolve('/showthread.php?tid=91&action=lastpost&highlight=teak')).toEqual({
      kind: 'thread',
      legacyId: 91,
      postId: null,
      page: null,
    })
  })

  it.each(['/ShowThread.php?tid=91', 'showthread.php?tid=91', '/showthread.php/?tid=91'])(
    'accepts the variant %s',
    (url) => {
      expect(resolve(url)).toMatchObject({ kind: 'thread', legacyId: 91 })
    },
  )
})

describe('the rewritten forms', () => {
  it.each([
    ['/Thread-Bikeshedding-91', { kind: 'thread', legacyId: 91, postId: null, page: null }],
    ['/Thread-Bikeshedding-91?page=4', { kind: 'thread', legacyId: 91, postId: null, page: 4 }],
    ['/Thread-Bikeshedding--4102', { kind: 'post', legacyId: 4102 }],
    ['/Forum-General-3', { kind: 'forum', legacyId: 3, page: null }],
    ['/Forum-General-3?page=2', { kind: 'forum', legacyId: 3, page: 2 }],
  ])('resolves %s', (url, expected) => {
    expect(resolve(url)).toEqual(expected)
  })

  it('ignores the slug entirely', () => {
    expect(resolve('/Thread-completely-different-words-91')).toMatchObject({ legacyId: 91 })
    expect(resolve('/Thread--91')).toMatchObject({ legacyId: 91 })
  })
})

describe('what resolves to nothing', () => {
  it.each([
    ['/showthread.php', 'no id at all'],
    ['/showthread.php?tid=0', 'MyBB ids are never 0'],
    ['/showthread.php?tid=-1', 'nor negative'],
    ['/showthread.php?tid=abc', 'nor words'],
    ['/forumdisplay.php', 'no fid'],
    ['/member.php?action=login', 'the login form is not content'],
    ['/member.php', 'no uid'],
    ['/misc.php?action=help', 'not a content page'],
    ['/User-wren', 'a username is not an id, and usernames change'],
    ['/Thread-Bikeshedding-page-2', 'a slug with no id cannot be resolved without guessing'],
    ['/some/other/path', 'not a MyBB URL'],
  ])('refuses %s — %s', (url) => {
    expect(resolve(url)).toBeNull()
  })
})

describe('the redirect path', () => {
  it('sends a thread to its slugged address', () => {
    const target = resolve('/showthread.php?tid=91') as LegacyTarget
    expect(legacyRedirectPath(target, 7, 'bikeshedding')).toBe('/thread/7-bikeshedding')
  })

  it('carries a page number through', () => {
    const target = resolve('/showthread.php?tid=91&page=3') as LegacyTarget
    expect(legacyRedirectPath(target, 7, 'bikeshedding')).toBe('/thread/7-bikeshedding?page=3')
  })

  it('omits page 1', () => {
    const target = resolve('/showthread.php?tid=91&page=1') as LegacyTarget
    expect(legacyRedirectPath(target, 7, 'bikeshedding')).toBe('/thread/7-bikeshedding')
  })

  it('prefers the post anchor over the page number', () => {
    const target = resolve('/showthread.php?tid=91&pid=4102&page=3') as LegacyTarget
    expect(legacyRedirectPath(target, 7, 'bikeshedding')).toBe('/thread/7-bikeshedding?post=4102')
  })

  it('sends a forum, a post and a member to theirs', () => {
    expect(legacyRedirectPath(resolve('/forumdisplay.php?fid=3')!, 2, 'general')).toBe(
      '/2-general',
    )
    expect(legacyRedirectPath(resolve('/showthread.php?pid=4102')!, 55, null)).toBe('/post/55')
    expect(legacyRedirectPath(resolve('/member.php?uid=12')!, 4, 'marlow')).toBe('/member/4-marlow')
  })

  it('sends the index home without needing a lookup', () => {
    expect(legacyRedirectPath({ kind: 'home' }, null, null)).toBe('/')
  })

  it('refuses to invent a path for a row that was never imported', () => {
    expect(legacyRedirectPath(resolve('/showthread.php?tid=91')!, null, null)).toBeNull()
    expect(legacyRedirectPath(resolve('/forumdisplay.php?fid=3')!, null, null)).toBeNull()
  })

  it('falls back to a placeholder slug rather than an empty segment', () => {
    expect(legacyRedirectPath(resolve('/showthread.php?tid=91')!, 7, null)).toBe('/thread/7-thread')
  })
})
