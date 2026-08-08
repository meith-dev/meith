/**
 * F86 — every MyBB URL form, resolved to what this board would serve.
 *
 * ## Why this is worth a table
 *
 * A community's inbound links are most of its traffic, and they accumulate for
 * years: search results, other communities' posts, bookmarks, e-mails somebody sent
 * in 2013. An import that changes every URL without redirecting throws that away
 * on migration day, and unlike almost every other migration mistake it is not
 * recoverable afterwards — the links are on other people's servers.
 *
 * So this is a **pure parser**: MyBB path plus query in, `{ kind, legacyId }`
 * out. The lookup from legacy id to this board's id is `legacy_ids` (F85), and
 * the redirect is the app's. Splitting it that way is what lets every form be a
 * row in a table-driven test rather than a route somebody has to exercise.
 *
 * ## The forms, and why there are so many
 *
 * MyBB serves the same page under several addresses. The bare script
 * (`showthread.php?tid=91`), the same with an anchor
 * (`…&pid=4102#pid4102`), the "SEO" rewrite (`Thread-Some-Title`), the
 * rewrite with a page number, and `misc.php`-style aliases. Boards enable the
 * rewrites at different times, so a board's history usually contains **all** of
 * them, and handling only the modern shape misses the older half of the links.
 *
 * ## What is deliberately not matched
 *
 * No copied MyBB source, no reproduced `.htaccess` — the project rule is that
 * MyBB artefacts are never copied. These patterns are written from the *public
 * shape of the URLs*, which is what a link in the wild looks like, and each is
 * pinned by a test rather than by resemblance to somebody's rewrite file.
 */

export type LegacyTarget =
  | { readonly kind: 'thread'; readonly legacyId: number; readonly postId: number | null; readonly page: number | null }
  | { readonly kind: 'community'; readonly legacyId: number; readonly page: number | null }
  | { readonly kind: 'post'; readonly legacyId: number }
  | { readonly kind: 'user'; readonly legacyId: number }
  | { readonly kind: 'home' }

/** A positive integer, or `null`. MyBB ids are never 0 and never negative. */
function id(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Resolve a MyBB URL, or `null` when it is not one.
 *
 * `null` means "this board has nothing to say about that address" and the caller
 * answers 404 — which is the right response for `showthread.php` with no `tid`.
 * Redirecting an unparseable legacy URL to the index would turn every broken old
 * link into a soft 404, which is worse for a crawler than the honest one.
 */
export function resolveLegacyUrl(pathname: string, search: string): LegacyTarget | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  /* Leading slash, no trailing one, case-insensitive: MyBB links appear both ways. */
  const path = pathname.replace(/\/+$/, '').replace(/^\/+/, '').toLowerCase()

  switch (path) {
    case 'showthread.php': {
      /*
       * `pid` alone is a valid MyBB link — "the post with this id", wherever it
       * is. It resolves to a *post* rather than a thread, because the board has
       * to look up which thread that post is in, and this parser has no database.
       */
      const tid = id(params.get('tid'))
      const pid = id(params.get('pid'))

      if (tid !== null) {
        return { kind: 'thread', legacyId: tid, postId: pid, page: id(params.get('page')) }
      }
      if (pid !== null) return { kind: 'post', legacyId: pid }
      return null
    }

    case 'forumdisplay.php': {
      const fid = id(params.get('fid'))
      return fid === null ? null : { kind: 'community', legacyId: fid, page: id(params.get('page')) }
    }

    case 'member.php': {
      /*
       * `member.php` is also the login and registration script — `?action=login`
       * — and those are not content. They resolve to nothing, so the board
       * answers 404 rather than redirecting somebody's bookmark of a login form
       * to a random member's profile.
       */
      const uid = id(params.get('uid'))
      if (uid === null) return null
      return { kind: 'user', legacyId: uid }
    }

    case 'index.php':
    case '':
      return { kind: 'home' }

    default:
      return resolveRewrittenUrl(path, params)
  }
}

/**
 * The "SEO" rewrites, which most boards turned on at some point.
 *
 * `Thread-Some-Title`, `Thread-Some-Title?page=2`, `Thread-Some-Title--4102`,
 * `Forum-General`, `User-wren`. The **id is the only part that matters** — the
 * title slug is decoration MyBB regenerates from the subject, so matching on it
 * would break every link to a thread that was ever renamed.
 *
 * `User-<name>` is the one form that carries no id at all, which is why it is
 * not resolvable here: usernames change, and resolving one needs a lookup this
 * parser cannot do. The app can handle it separately; pretending otherwise would
 * mean this function sometimes needs a database and sometimes does not.
 */
function resolveRewrittenUrl(path: string, params: URLSearchParams): LegacyTarget | null {
  /* Thread-Title--<pid>: MyBB's post anchor in rewritten form. */
  const threadPost = /^thread-[^/]*?--(\d+)$/.exec(path)
  if (threadPost !== null) {
    const pid = id(threadPost[1] ?? null)
    return pid === null ? null : { kind: 'post', legacyId: pid }
  }

  /*
   * Thread-Title or Thread-Title-page-2 — but the id is not in the slug at all
   * in MyBB's default rewrite, which is why these need the trailing numeric
   * form. A slug-only link is not resolvable without a title lookup, and a
   * *guess* at which thread somebody meant is worse than a 404.
   */
  const threadPaged = /^thread-.*?-page-(\d+)$/.exec(path)
  if (threadPaged !== null) return null

  const community = /^forum-[^/]*?-(\d+)$/.exec(path)
  if (community !== null) {
    const fid = id(community[1] ?? null)
    return fid === null ? null : { kind: 'community', legacyId: fid, page: id(params.get('page')) }
  }

  const thread = /^thread-[^/]*?-(\d+)$/.exec(path)
  if (thread !== null) {
    const tid = id(thread[1] ?? null)
    return tid === null
      ? null
      : { kind: 'thread', legacyId: tid, postId: null, page: id(params.get('page')) }
  }

  return null
}

/**
 * Where a resolved target sends somebody, given this board's ids.
 *
 * Separate from the parsing so the URL shape lives in one place and the *lookup*
 * lives in the app. `newId` is what `legacy_ids` returned; `null` means the row
 * was never imported, and the caller answers 404 rather than inventing a path.
 */
export function legacyRedirectPath(
  target: LegacyTarget,
  newId: number | null,
  slug: string | null,
): string | null {
  switch (target.kind) {
    case 'home':
      return '/'

    case 'community': {
      if (newId === null) return null
      const base = `/${newId}-${slug ?? 'community'}`
      return target.page !== null && target.page > 1 ? `${base}?page=${target.page}` : base
    }

    case 'thread': {
      if (newId === null) return null
      const base = `/thread/${newId}-${slug ?? 'thread'}`
      /*
       * A post anchor beats a page number. MyBB's `pid` in a thread URL means
       * "this specific post", and this board pages by post id (F31) — so the
       * `?post=` form lands on the right page *and* the right post, where a page
       * number copied across would be right only if both boards paginate the
       * same way, which they do not.
       */
      if (target.postId !== null) return `${base}?post=${target.postId}`
      return target.page !== null && target.page > 1 ? `${base}?page=${target.page}` : base
    }

    case 'post':
      return newId === null ? null : `/post/${newId}`

    case 'user':
      return newId === null ? null : `/member/${newId}-${slug ?? 'member'}`
  }
}
