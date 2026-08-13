import { Alert, AlertDescription, AlertTitle, Avatar, Card } from '@meith/ui'
import type { PostBitSlotModel } from '@meith/theme-kit'

import { HEADING, LINK, MICRO, MICRO_BARE, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

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

function GroupBadge({
  badge,
}: {
  badge: NonNullable<PostBitSlotModel['post']['author']['badge']>
}) {
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

function StatLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={MICRO}>{label}</dt>
      <dd className={`${NUMERIC} text-xs font-semibold text-foreground`}>{children}</dd>
    </div>
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
    <>
      <div className="flex items-start gap-3">
        <Avatar
          src={author.avatarUrl}
          name={author.username}
          size={40}
          className="rounded-sm border-border"
        />

        <div className="min-w-0">
          <p className="truncate">
            <UserRef user={author} className={`${HEADING} text-sm`} />
          </p>

          {author.title !== null && <p className={`${MICRO} mt-0.5 truncate`}>{author.title}</p>}

          {author.isOnline && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-moderation-approved">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-moderation-approved" />
              Online
            </p>
          )}
        </div>
      </div>

      {author.badge != null && (
        <p className="mt-2">
          <GroupBadge badge={author.badge} />
        </p>
      )}

      {badges}

      <dl className="mt-2.5 space-y-1 border-t-2 border-t-secondary pt-2">
        <StatLine label="Posts">{author.postCount.toLocaleString('en')}</StatLine>
        {author.reputation != null && (
          <StatLine label="Rep">{author.reputation.toLocaleString('en')}</StatLine>
        )}
        {author.joinedAt !== null && (
          <StatLine label="Joined">
            <Stamp at={author.joinedAt} />
          </StatLine>
        )}
        {author.fields.map((field) => (
          <StatLine key={field.label} label={field.label}>
            <span className="truncate">{field.value}</span>
          </StatLine>
        ))}
      </dl>
    </>
  )
}

export function PostBit({ post, select, regions }: PostBitSlotModel) {
  return (
    <Card
      as="article"
      id={`post-${post.number}`}
      data-post-id={post.id}
      data-visibility={post.visibility}
      className={`target:bg-post-highlight ${VISIBILITY_TINT[post.visibility]}`}
    >
      <StatusBanner visibility={post.visibility} />

      <div className="grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="border-b border-border bg-surface px-4 py-3 sm:border-r sm:border-b-0">
          <AuthorBlock author={post.author} badges={regions.pluginBadges} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              {select !== null && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name={select.name}
                    value={select.value}
                    form={select.formId}
                    className="size-3.5 accent-primary"
                  />
                  <span className="sr-only">{select.label}</span>
                </label>
              )}

              {post.isFirstPost && (
                <span
                  className={`${MICRO_BARE} rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground`}
                >
                  Opening post
                </span>
              )}

              <Stamp at={post.postedAt} />
            </span>

            <a href={post.permalink} className={`${NUMERIC} ${MUTED_LINK}`}>
              #{post.number}
            </a>
          </div>

          {post.ignored !== null ? (
            <div className="px-4 py-5 text-sm text-muted-foreground">
              You are ignoring{' '}
              <span className="font-semibold text-foreground">{post.ignored.authorUsername}</span>.
              This post is hidden.{' '}
              <a href={post.ignored.revealHref} className={`font-semibold text-foreground ${LINK}`}>
                Show it anyway
              </a>
            </div>
          ) : (
            <div className="px-4 py-3.5">
              <div
                className="prose-md text-sm"
                dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
              />

              {post.editedNote !== null && (
                <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                  {post.editedNote}
                </p>
              )}
            </div>
          )}

          {post.attachments.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <h4 className={`${MICRO} mb-2`}>
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
                          className="mb-1 max-h-56 w-auto rounded-sm border border-border object-contain"
                        />
                      ) : null}
                      <span className="block truncate">
                        <span className="font-semibold group-hover:underline">{file.filename}</span>{' '}
                        <span className="opacity-70">({file.size})</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {post.ignored === null && post.author.signatureHtml !== null && (
            <div
              className="prose-md border-t border-border px-4 py-2 text-xs text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: post.author.signatureHtml }}
            />
          )}

          {regions.pluginFooter !== undefined && regions.pluginFooter !== null && (
            <div className="border-t border-border px-4 py-2 text-xs empty:hidden">
              {regions.pluginFooter}
            </div>
          )}

          {regions.actions !== null && <footer>{regions.actions}</footer>}
        </div>
      </div>
    </Card>
  )
}
