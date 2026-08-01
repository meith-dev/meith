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

export function PostBit({ post, select, regions }: PostBitSlotModel) {
  return (
    <article id={`post-${post.id}`} className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          {/* F52; see ThreadRow for why the association is by `form` id. */}
          {select !== null && (
            <label className="flex items-center">
              <span className="sr-only">{select.label}</span>
              <input
                type="checkbox"
                name={select.name}
                value={select.value}
                form={select.formId}
                className="size-4"
              />
            </label>
          )}
          {post.author.profileHref === null ? <span>{post.author.username}</span> : <a href={post.author.profileHref} className="hover:text-foreground">{post.author.username}</a>}
        </span>
        <a href={post.permalink} className="hover:text-foreground">
          <time dateTime={post.postedAt.iso}>{post.postedAt.label}</time> #{post.number}
        </a>
      </header>
      <StatusBanner visibility={post.visibility} />
      {/*
        F59's custom fields, for the ones an operator marked for the postbit and
        this viewer may see. Plain text by contract — the app resolves them, and
        a theme never inserts a member-supplied value as markup.
      */}
      {post.author.fields.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          {post.author.fields.map((field) => (
            <div key={field.label} className="flex gap-1">
              <dt className="font-medium">{field.label}:</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {post.ignored !== null ? (
        /*
          F61. The body is not in `post.bodyHtml` at all — the app withheld it —
          so there is nothing here to hide and nothing a stylesheet could
          reveal. The link is the only way to see it, and it is a plain `<a>`,
          so this works with scripting off like everything else.
        */
        <div className="px-4 py-4">
          <p className="text-sm text-muted-foreground">
            You are ignoring{' '}
            <span className="font-medium text-foreground">{post.ignored.authorUsername}</span>.
            This post is hidden.{' '}
            <a href={post.ignored.revealHref} className="text-primary hover:underline">
              Show it anyway
            </a>
          </p>
        </div>
      ) : (
        <div className="px-4 py-4">
          <div className="whitespace-normal break-words" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
          {post.editedNote !== null && (
            <p className="mt-3 border-t border-border pt-2 text-xs italic text-muted-foreground">
              {post.editedNote}
            </p>
          )}
        </div>
      )}
      {regions.actions !== null && <footer className="border-t border-border px-4 py-2">{regions.actions}</footer>}
    </article>
  )
}
