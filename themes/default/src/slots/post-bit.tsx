import { Alert, AlertDescription, AlertTitle, Avatar, Card } from '@meith/ui'
import type { PostBitSlotModel } from '@meith/theme-kit'

import { LINK, MUTED_LINK, NUMERIC, Stamp } from '../shared'

/**
 * One post (F31) — the board's load-bearing surface.
 *
 * A server component, and the registry pins it that way: a thread page is fifty
 * of these, and marking this slot `client` would serialise every post and every
 * author block into the browser payload. See the header of
 * `packages/theme-kit/src/slots.ts` for what that costs.
 *
 * ## The author column, which this slot used to leave out
 *
 * `PostAuthorModel` carries `title`, `postCount`, `joinedAt`, `isOnline`,
 * `avatarUrl` and the operator's custom fields. The previous version of this
 * slot rendered the avatar and the name, and dropped the rest — five model
 * fields with a producer and no consumer, which is the failure the F77 contract
 * suite was written to find and cannot see, because nothing is broken: the page
 * renders, and a feature is simply invisible.
 *
 * They are not decoration on a forum. "Is this person new here, and do they post
 * a lot?" is how a reader weighs an answer from a stranger, and it is the single
 * oldest convention in board software for that reason. So the author gets a
 * column of their own on a wide screen and a compact byline on a narrow one —
 * the same information, in the shape each width can hold.
 *
 * ## Visibility is a banner, not a tint
 *
 * A post only reaches a theme in a non-visible state when the reader is allowed
 * to see it — the app leaves the rest out of the query, so hiding one here would
 * put its body in the HTML for everybody. What the banner has to do is make the
 * state impossible to miss: a moderator reading a deleted post must not answer
 * it thinking it is still on the board. The card also carries the state as a
 * `data-` attribute and a tinted rule, so a page of mixed posts is scannable
 * without reading each banner.
 */

const VISIBILITY_TINT = {
  visible: '',
  unapproved: 'border-thread-unapproved/50 bg-post-unapproved/40',
  deleted: 'border-thread-deleted/50 bg-destructive/5',
} as const

function StatusBanner({ visibility }: { visibility: PostBitSlotModel['post']['visibility'] }) {
  if (visibility === 'visible') return null

  return (
    <Alert
      tone={visibility === 'deleted' ? 'error' : 'warning'}
      /*
       * Square, and only the leading rule and the bottom edge survive: this
       * banner is the top of the card rather than a box inside it. The left
       * border is what `Alert` carries the tone on, so it is deliberately not
       * among the edges removed here.
       */
      className="rounded-none border-t-0 border-r-0"
    >
      <AlertDescription>
        <AlertTitle>
          {visibility === 'deleted' ? 'Deleted post.' : 'Waiting for approval.'}
        </AlertTitle>{' '}
        Only moderators can see this.
      </AlertDescription>
    </Alert>
  )
}

/**
 * Who wrote it.
 *
 * `isOnline` is a dot *and* the word, for the reason every state on this board
 * is: a green circle on its own is nothing to a screen reader and ambiguous to
 * anybody who has not learned the convention.
 */
function AuthorBlock({
  author,
  badges,
}: {
  author: PostBitSlotModel['post']['author']
  badges: React.ReactNode
}) {
  return (
    <div className="flex gap-3 sm:flex-col sm:gap-2 sm:text-center">
      <Avatar src={author.avatarUrl} name={author.username} size={48} className="sm:self-center" />

      <div className="min-w-0 flex-1 sm:flex-none">
        <p className="truncate text-sm">
          {author.profileHref === null ? (
            <span className="font-semibold text-foreground">{author.username}</span>
          ) : (
            <a href={author.profileHref} className={`font-semibold text-foreground ${LINK}`}>
              {author.username}
            </a>
          )}
        </p>

        {author.title !== null && (
          <p className="truncate text-xs text-muted-foreground">{author.title}</p>
        )}

        {author.isOnline && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-moderation-approved sm:justify-center">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-moderation-approved" />
            Online
          </p>
        )}

        {badges}

        <dl className={`mt-1.5 text-xs text-muted-foreground ${NUMERIC}`}>
          <div className="flex gap-1 sm:justify-center">
            <dt className="sr-only">Posts</dt>
            <dd>
              {author.postCount.toLocaleString('en')} {author.postCount === 1 ? 'post' : 'posts'}
            </dd>
          </div>
          {author.joinedAt !== null && (
            <div className="flex gap-1 sm:justify-center">
              <dt className="sr-only">Joined</dt>
              <dd>
                Joined <Stamp at={author.joinedAt} />
              </dd>
            </div>
          )}
        </dl>

        {/*
          F59's custom fields, for the ones an operator marked for the postbit
          and this viewer may see. Plain text by contract — the app resolves
          them, and a theme never inserts a member-supplied value as markup.
        */}
        {author.fields.length > 0 && (
          <dl className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {author.fields.map((field) => (
              <div key={field.label} className="flex justify-center gap-1">
                <dt className="font-medium">{field.label}:</dt>
                <dd className="truncate">{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}

export function PostBit({ post, select, regions }: PostBitSlotModel) {
  return (
    <Card
      as="article"
      id={`post-${post.id}`}
      data-visibility={post.visibility}
      className={VISIBILITY_TINT[post.visibility]}
    >
      <StatusBanner visibility={post.visibility} />

      <div className="grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="border-b border-border px-4 py-3 sm:border-r sm:border-b-0 sm:bg-muted/40">
          <AuthorBlock author={post.author} badges={regions.pluginBadges} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            {/*
              F52; see ThreadRow for why the association is by `form` id rather
              than by nesting this inside the moderation form.
            */}
            {select === null ? (
              <span />
            ) : (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name={select.name}
                  value={select.value}
                  form={select.formId}
                  className="size-4 accent-primary"
                />
                <span className="sr-only">{select.label}</span>
              </label>
            )}

            <a href={post.permalink} className={MUTED_LINK}>
              <Stamp at={post.postedAt} />
              <span className={`ml-2 ${NUMERIC}`}>#{post.number}</span>
            </a>
          </div>

          {post.ignored !== null ? (
            /*
              F61. The body is not in `post.bodyHtml` at all — the app withheld
              it — so there is nothing here to hide and nothing a stylesheet
              could reveal. The link is the only way to see it, and it is a
              plain `<a>`, so this works with scripting off like everything else.
            */
            <div className="px-4 py-5 text-sm text-muted-foreground">
              You are ignoring{' '}
              <span className="font-medium text-foreground">{post.ignored.authorUsername}</span>.
              This post is hidden.{' '}
              <a href={post.ignored.revealHref} className={`font-medium text-foreground ${LINK}`}>
                Show it anyway
              </a>
            </div>
          ) : (
            <div className="px-4 py-4">
              {/*
                Trusted markup: the sanitising renderer's own output (F36).
                `.prose-md` is defined in the app's stylesheet beside the
                `.bb-*` rules, because the class names come from the renderer.
              */}
              <div
                className="prose-md text-sm"
                dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
              />

              {post.editedNote !== null && (
                <p className="mt-4 border-t border-border pt-2 text-xs text-muted-foreground">
                  {post.editedNote}
                </p>
              )}
            </div>
          )}

          {/*
            F42's attachments. Every entry is already downloadable — the app
            drops anything still being re-encoded — so there is no "processing"
            state to render here. An image is shown inline at its thumbnail,
            which is a link to the full file; anything else is a plain download
            link, because the board does not parse those formats and will not
            pretend to preview them.
          */}
          {post.attachments.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {post.attachments.length}{' '}
                {post.attachments.length === 1 ? 'attachment' : 'attachments'}
              </h4>
              <ul className="flex flex-wrap gap-3">
                {post.attachments.map((file) => (
                  <li key={file.id} className="max-w-full">
                    <a
                      href={file.href}
                      className="group block max-w-full text-xs text-muted-foreground hover:text-foreground"
                    >
                      {file.isImage ? (
                        /*
                          `thumbnailHref ?? href` is the whole rule: an image
                          small enough that a thumbnail would be the same
                          picture has none, and the full file is already the
                          right size.
                        */
                        <img
                          src={file.thumbnailHref ?? file.href}
                          alt={file.filename}
                          width={file.width ?? undefined}
                          height={file.height ?? undefined}
                          loading="lazy"
                          decoding="async"
                          className="mb-1 max-h-56 w-auto rounded-md border border-border object-contain"
                        />
                      ) : null}
                      <span className="block truncate">
                        <span className="font-medium group-hover:underline">{file.filename}</span>{' '}
                        <span className="opacity-70">({file.size})</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            F58's signature. Trusted HTML from `@meith/markdown`, rendered with
            the narrower signature registry — the app resolves it, and a hidden
            post (F61) carries none. Quieter and smaller than the post it is
            attached to, because that is what a signature is.
          */}
          {post.ignored === null && post.author.signatureHtml !== null && (
            <div
              className="prose-md border-t border-border px-4 py-2.5 text-xs text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: post.author.signatureHtml }}
            />
          )}

          {/*
            F80's `postbit.footer` region, between the body and the actions.

            `empty:hidden` on both of these is load-bearing, not tidiness. A
            region is a *rendered node*, and a node that renders nothing is
            indistinguishable from one that renders something until the browser
            has it: `PostActions` returns `null` for a guest, because every
            action on the model is `null` for somebody who cannot quote, edit or
            report. The theme cannot see that, so it was drawing a bordered
            empty bar under every post on the busiest page a guest ever loads.
            `:empty` can see it, because by then the element genuinely has no
            child nodes.
          */}
          {regions.pluginFooter !== undefined && regions.pluginFooter !== null && (
            <div className="border-t border-border px-4 py-2 text-xs empty:hidden">
              {regions.pluginFooter}
            </div>
          )}

          {regions.actions !== null && (
            <footer className="border-t border-border px-4 py-2 empty:hidden">
              {regions.actions}
            </footer>
          )}
        </div>
      </div>
    </Card>
  )
}
