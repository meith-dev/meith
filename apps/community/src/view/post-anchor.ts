/** `#pid-90` — durable: written by the software, never renumbered. */
export function postAnchor(postId: number): string {
  return `pid-${postId}`
}

/** `#post-6` — the post's position in its thread, the "#6" the page shows. */
export function numberAnchor(number: number): string {
  return `post-${number}`
}
