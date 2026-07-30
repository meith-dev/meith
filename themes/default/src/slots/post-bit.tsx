import type { PostBitSlotModel } from '@forum/theme-kit'

/**
 * The state banner (F41).
 *
 * A post only reaches a theme in a non-visible state when the reader is allowed
 * to see it — the app leaves the rest out of the query, so hiding one here
 * would put its body in the HTML for everybody. What the banner has to do is
 * make the state impossible to miss: a moderator reading a deleted post must
 * not answer it thinking it is still on the board.
 */
function StatusBanner({ visibility }: { visibility: PostBitSlotModel['post']['visibility'] }) {
  if (visibility === 'visible') return null
  const message =
    visibility === 'deleted'
      ? 'This post has been deleted. Only moderators can see it.'
      : 'This post is waiting for approval. Only moderators can see it.'
  return (
    <p className="border-b border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
      {message}
    </p>
  )
}

export function PostBit({ post, regions }: PostBitSlotModel) {
  return (
    <article id={`post-${post.id}`} className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2 text-xs text-muted-foreground">
        {post.author.profileHref === null ? <span>{post.author.username}</span> : <a href={post.author.profileHref} className="hover:text-foreground">{post.author.username}</a>}
        <a href={post.permalink} className="hover:text-foreground">
          <time dateTime={post.postedAt.iso}>{post.postedAt.label}</time> #{post.number}
        </a>
      </header>
      <StatusBanner visibility={post.visibility} />
      <div className="px-4 py-4">
        <div className="whitespace-normal break-words" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
        {post.editedNote !== null && (
          <p className="mt-3 border-t border-border pt-2 text-xs italic text-muted-foreground">
            {post.editedNote}
          </p>
        )}
      </div>
      {regions.actions !== null && <footer className="border-t border-border px-4 py-2">{regions.actions}</footer>}
    </article>
  )
}
