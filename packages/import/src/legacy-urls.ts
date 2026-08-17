export type LegacyTarget =
  | {
      readonly kind: 'thread'
      readonly legacyId: number
      readonly postId: number | null
      readonly page: number | null
    }
  | { readonly kind: 'forum'; readonly legacyId: number; readonly page: number | null }
  | { readonly kind: 'post'; readonly legacyId: number }
  | { readonly kind: 'user'; readonly legacyId: number }
  | { readonly kind: 'home' }

function id(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function resolveLegacyUrl(pathname: string, search: string): LegacyTarget | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  const path = pathname.replace(/\/+$/, '').replace(/^\/+/, '').toLowerCase()

  switch (path) {
    case 'showthread.php': {
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
      return fid === null ? null : { kind: 'forum', legacyId: fid, page: id(params.get('page')) }
    }

    case 'member.php': {
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

function resolveRewrittenUrl(path: string, params: URLSearchParams): LegacyTarget | null {
  const threadPost = /^thread-[^/]*?--(\d+)$/.exec(path)
  if (threadPost !== null) {
    const pid = id(threadPost[1] ?? null)
    return pid === null ? null : { kind: 'post', legacyId: pid }
  }

  const threadPaged = /^thread-.*?-page-(\d+)$/.exec(path)
  if (threadPaged !== null) return null

  const forum = /^forum-[^/]*?-(\d+)$/.exec(path)
  if (forum !== null) {
    const fid = id(forum[1] ?? null)
    return fid === null ? null : { kind: 'forum', legacyId: fid, page: id(params.get('page')) }
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

export function legacyRedirectPath(
  target: LegacyTarget,
  newId: number | null,
  slug: string | null,
): string | null {
  switch (target.kind) {
    case 'home':
      return '/'

    case 'forum': {
      if (newId === null) return null
      const base = `/${newId}-${slug ?? 'forum'}`
      return target.page !== null && target.page > 1 ? `${base}?page=${target.page}` : base
    }

    case 'thread': {
      if (newId === null) return null
      const base = `/thread/${newId}-${slug ?? 'thread'}`
      if (target.postId !== null) return `${base}?post=${target.postId}`
      return target.page !== null && target.page > 1 ? `${base}?page=${target.page}` : base
    }

    case 'post':
      return newId === null ? null : `/post/${newId}`

    case 'user':
      return newId === null ? null : `/member/${newId}-${slug ?? 'member'}`
  }
}
