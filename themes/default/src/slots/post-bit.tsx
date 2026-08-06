import { Alert, AlertDescription, AlertTitle, Avatar, Card } from '@meith/ui'
import type { PostBitSlotModel } from '@meith/theme-kit'

import { LINK, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

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

function GroupBadge({ badge }: { badge: NonNullable<PostBitSlotModel['post']['author']['badge']> }) {
  const image = (
    <img
      src={badge.src}
      alt=""
      aria-hidden="true"
      className="h-4 w-auto max-w-full object-contain"
      loading="lazy"
      decoding="async"
    />
  )

  if (badge.darkSrc === null) return image

  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={badge.darkSrc} />
      {image}
    </picture>
  )
}

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
        { }
        <p className="truncate text-sm">
          <UserRef user={author} className="font-semibold text-foreground" />
        </p>

        { }
        {author.badge != null && (
          <p className="mt-1 flex sm:justify-center">
            <GroupBadge badge={author.badge} />
          </p>
        )}

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
          { }
          {author.reputation != null && (
            <div className="flex gap-1 sm:justify-center">
              <dt className="sr-only">Reputation</dt>
              <dd>{author.reputation.toLocaleString('en')} reputation</dd>
            </div>
          )}
        </dl>

        { }
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
            { }
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
              { }
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

          { }
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

          { }
          {post.ignored === null && post.author.signatureHtml !== null && (
            <div
              className="prose-md border-t border-border px-4 py-2.5 text-xs text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: post.author.signatureHtml }}
            />
          )}

          { }
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
