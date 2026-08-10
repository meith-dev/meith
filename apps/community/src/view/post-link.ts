/** `#post-6` — the post's place in its thread, which is the "#6" it is shown as. */
export function postAnchor(number: number): string {
  return `post-${number}`
}

/** A link to one post by id; the thread page turns it into the page and anchor. */
export function postLink(threadHref: string, postId: number): string {
  const path = threadHref.split('#')[0] ?? ''
  return `${path}${path.includes('?') ? '&' : '?'}post=${postId}`
}
