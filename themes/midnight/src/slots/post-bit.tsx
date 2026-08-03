import type { PostBitSlotModel } from '@forum/theme-kit'

/**
 * One post, in the **classic two-column layout**: author on the left, body on
 * the right.
 *
 * This is the largest single difference from the default theme, which runs the
 * author along a header strip above the body. Both are handed the same
 * `PostBitSlotModel`; the layout is entirely the theme's, which is the claim
 * F78 exists to demonstrate.
 *
 * It stays a **server** slot. `PostBit` renders once per post, so a client
 * implementation serialises every body and every author block into the browser
 * payload — the one number this product is built around. The registry declares
 * the kind and `scripts/slot-kinds.mjs` enforces it; this comment is here
 * because a theme author copying this file is exactly who needs to read it.
 */
function StatusBanner({ visibility }: { visibility: PostBitSlotModel['post']['visibility'] }) {
  if (visibility === 'visible') return null
  return (
    <p className="border-b border-border bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
      {visibility === 'deleted'
        ? 'deleted — visible to moderators only'
        : 'awaiting approval — visible to moderators only'}
    </p>
  )
}

export function PostBit({ post, select, regions }: PostBitSlotModel) {
  return (
    <article id={`post-${post.id}`} className="border border-border">
      <StatusBanner visibility={post.visibility} />

      <div className="grid grid-cols-1 sm:grid-cols-[11rem_1fr]">
        <div className="border-b border-border bg-secondary px-3 py-2 sm:border-b-0 sm:border-r">
          <p className="flex items-center gap-2">
            {select !== null && (
              <label className="flex items-center">
                <span className="sr-only">{select.label}</span>
                <input
                  type="checkbox"
                  name={select.name}
                  value={select.value}
                  form={select.formId}
                  className="size-3.5"
                />
              </label>
            )}
            {post.author.profileHref === null ? (
              <span className="font-medium">{post.author.username}</span>
            ) : (
              <a href={post.author.profileHref} className="font-medium hover:text-primary">
                {post.author.username}
              </a>
            )}
          </p>

          {post.author.title !== null && (
            <p className="font-mono text-xs text-muted-foreground">{post.author.title}</p>
          )}
          {post.author.avatarUrl !== null && (
            /*
              Absent rather than a placeholder, and sized in the markup as well
              as in CSS so the column does not reflow as images arrive.
            */
            <img
              src={post.author.avatarUrl}
              alt=""
              width={64}
              height={64}
              className="mt-2 size-16 border border-border object-cover"
            />
          )}
          <dl className="mt-2 font-mono text-xs text-muted-foreground">
            <div className="flex gap-1">
              <dt>posts</dt>
              <dd className="text-foreground">{post.author.postCount}</dd>
            </div>
            {post.author.joinedAt !== null && (
              <div className="flex gap-1">
                <dt>joined</dt>
                <dd>
                  <time dateTime={post.author.joinedAt.iso}>{post.author.joinedAt.label}</time>
                </dd>
              </div>
            )}
            {post.author.isOnline && <div className="text-forum-unread">online</div>}
          </dl>

          {/* F59's fields: text, never markup — a member-supplied value is not HTML. */}
          {post.author.fields.length > 0 && (
            <dl className="mt-2 font-mono text-xs text-muted-foreground">
              {post.author.fields.map((field) => (
                <div key={field.label} className="flex gap-1">
                  <dt>{field.label}</dt>
                  <dd className="text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-1 font-mono text-xs text-muted-foreground">
            <time dateTime={post.postedAt.iso}>{post.postedAt.label}</time>
            <a href={post.permalink} className="hover:text-foreground">
              #{post.number}
            </a>
          </div>

          {post.ignored !== null ? (
            /*
              The body is withheld server-side, not hidden with CSS — an
              "ignored" post whose text is in the HTML is a preference rather
              than a feature. The reveal link is required: a hidden post with no
              way to see it is a hole in a conversation.
            */
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Post from {post.ignored.authorUsername}, who you are ignoring.{' '}
              <a href={post.ignored.revealHref} className="text-primary hover:underline">
                Show it
              </a>
            </p>
          ) : (
            <>
              {/* Pre-rendered by the sanitising BBCode renderer (F36). */}
              <div
                className="prose-forum px-3 py-3 text-sm"
                dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
              />

              {post.attachments.length > 0 && (
                <ul className="border-t border-border px-3 py-2 font-mono text-xs">
                  {post.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a href={attachment.href} className="text-primary hover:underline">
                        {attachment.filename}
                      </a>
                      <span className="ml-2 text-muted-foreground">{attachment.size}</span>
                    </li>
                  ))}
                </ul>
              )}

              {post.author.signatureHtml !== null && (
                <div
                  className="border-t border-border px-3 py-2 text-xs text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: post.author.signatureHtml }}
                />
              )}
            </>
          )}

          {post.editedNote !== null && (
            <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
              {post.editedNote}
            </p>
          )}

          {regions.actions !== null && (
            <div className="border-t border-border px-3 py-1">{regions.actions}</div>
          )}
        </div>
      </div>
    </article>
  )
}
