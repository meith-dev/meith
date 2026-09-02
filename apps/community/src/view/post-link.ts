import type { PostLocation } from '@meith/posts'

export function postAnchor(number: number): string {
  return `post-${number}`
}

export function postLink(threadHref: string, postId: number): string {
  const path = threadHref.split('#')[0] ?? ''
  return `${path}${path.includes('?') ? '&' : '?'}post=${postId}`
}

export function locatedHref(
  path: string,
  query: Record<string, string | readonly string[] | undefined>,
  location: PostLocation,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (
      value === undefined ||
      key === 'post' ||
      key === 'after' ||
      key === 'page' ||
      key === 'goto'
    )
      continue
    for (const one of typeof value === 'string' ? [value] : value) params.append(key, one)
  }
  if (location.afterId !== null) {
    params.set('after', String(location.afterId))
    params.set('page', String(location.page))
  }

  const search = params.toString()
  return `${path}${search === '' ? '' : `?${search}`}#${postAnchor(location.number)}`
}
