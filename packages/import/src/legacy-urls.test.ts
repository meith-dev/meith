import { describe, expect, it } from 'vitest'

import { legacyRedirectPath, resolveLegacyUrl, type LegacyTarget } from './legacy-urls'

/**
 * F86 — the URL table.
 *
 * A forum's inbound links accumulate for years and live on other people's
 * servers, so getting a form wrong is not recoverable after the migration. Every
 * form is therefore a row rather than a paragraph, and the ones that resolve to
 * *nothing* are rows too — a redirect that guesses is worse than a 404, because
 * a crawler treats a soft 404 as a real page.
 */

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

  /*
   * `pid` on its own is a real MyBB link — "the post with this id, wherever it
   * is". It resolves to a *post* rather than a thread, because working out which
   * thread needs a lookup this parser cannot do.
   */
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

  /* Links appear with and without a leading slash, and in both letter cases. */
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

  /*
   * The slug is decoration — MyBB regenerates it from the subject — so matching
   * on it would break every link to a thread that was ever renamed. Only the id
   * is read.
   */
  it('ignores the slug entirely', () => {
    expect(resolve('/Thread-completely-different-words-91')).toMatchObject({ legacyId: 91 })
    expect(resolve('/Thread--91')).toMatchObject({ legacyId: 91 })
  })
})

describe('what resolves to nothing', () => {
  /*
   * Each of these is a *deliberate* 404. Redirecting an unparseable legacy URL
   * to the index turns every broken old link into a soft 404, which a crawler
   * reads as a real page and which hides the breakage from whoever could fix it.
   */
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

  /* Page 1 is the bare address, not `?page=1` — two URLs for one page. */
  it('omits page 1', () => {
    const target = resolve('/showthread.php?tid=91&page=1') as LegacyTarget
    expect(legacyRedirectPath(target, 7, 'bikeshedding')).toBe('/thread/7-bikeshedding')
  })

  /*
   * A post anchor beats a page number. MyBB's `pid` means "this specific post",
   * and this board pages by post id — so `?post=` lands on the right page *and*
   * the right post, where copying the page number across would only be right if
   * both boards paginated identically, which they do not.
   */
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

  /*
   * A row that was never imported has no address here. Inventing one — sending
   * it to the index, or to `/thread/null-…` — would be a redirect to something
   * that is not the thing the link asked for.
   */
  it('refuses to invent a path for a row that was never imported', () => {
    expect(legacyRedirectPath(resolve('/showthread.php?tid=91')!, null, null)).toBeNull()
    expect(legacyRedirectPath(resolve('/forumdisplay.php?fid=3')!, null, null)).toBeNull()
  })

  it('falls back to a placeholder slug rather than an empty segment', () => {
    expect(legacyRedirectPath(resolve('/showthread.php?tid=91')!, 7, null)).toBe('/thread/7-thread')
  })
})
