import type { PostLocation } from '@meith/posts'

/** `#post-6` — the post's place in its thread, which is the "#6" it is shown as. */
export function postAnchor(number: number): string {
  return `post-${number}`
}

/** A link to one post by id; the thread page turns it into the page and anchor. */
export function postLink(threadHref: string, postId: number): string {
  const path = threadHref.split('#')[0] ?? ''
  return `${path}${path.includes('?') ? '&' : '?'}post=${postId}`
}

/** Where `?post=` resolves to: the page holding it, anchored at its number. */
export function locatedHref(
  path: string,
  query: Record<string, string | readonly string[] | undefined>,
  location: PostLocation,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || key === 'post' || key === 'after' || key === 'page') continue
    for (const one of typeof value === 'string' ? [value] : value) params.append(key, one)
  }
  if (location.afterId !== null) {
    params.set('after', String(location.afterId))
    params.set('page', String(location.page))
  }

  const search = params.toString()
  return `${path}${search === '' ? '' : `?${search}`}#${postAnchor(location.number)}`
}
