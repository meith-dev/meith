import type { PostBitSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Alert, AlertDescription, AlertTitle, Avatar, Card, cn } from '@meith/ui'

import { groupTags, isEmptyRegion, LINK, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

const VISIBILITY_TINT = {
  visible: '',
  unapproved: 'border-thread-unapproved/50 bg-post-unapproved/40',
  deleted: 'border-thread-deleted/50 bg-destructive/5',
} as const

const BODY_X = 'px-4 sm:px-5'

function StatusBanner({
  visibility,
  copy,
}: {
  visibility: PostBitSlotModel['post']['visibility']
  copy: SlotCopy
}) {
  if (visibility === 'visible') return null

  const c = (key: string) => fromSlotCopy(copy, `default.postBit.${key}`)

  return (
    <Alert
      tone={visibility === 'deleted' ? 'error' : 'warning'}
      className="rounded-none border-t-0 border-r-0"
    >
      <AlertDescription>
        <AlertTitle>
          {visibility === 'deleted' ? c('deletedPost') : c('waitingApproval')}
        </AlertTitle>{' '}
        {c('staffOnly')}
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

function AuthorBlock({
  author,
  badges,
  copy,
}: {
  author: PostBitSlotModel['post']['author']
  badges: React.ReactNode
  copy: SlotCopy
}) {
  const c = (key: string) => fromSlotCopy(copy, `default.postBit.${key}`)

  return (
    <div className="flex items-center gap-3 sm:flex-col sm:items-stretch sm:gap-2 sm:text-center">
      <Avatar src={author.avatarUrl} name={author.username} size={48} className="sm:self-center" />

      <div className="min-w-0 flex-1 sm:flex-none">
        <p className="truncate text-sm">
          <UserRef user={author} className="font-semibold" />
        </p>

        {author.badge != null && (
          <p className="mt-1 flex sm:justify-center">
            <GroupBadge badge={author.badge} />
          </p>
        )}

        {groupTags(author.groups, author.title).map((group) => (
          <p key={group.title} className="truncate text-xs text-muted-foreground">
            <span className={group.nameClass ?? undefined}>{group.title}</span>
          </p>
        ))}

        {author.isOnline && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-moderation-approved sm:justify-center">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-moderation-approved" />
            {c('online')}
          </p>
        )}

        {badges}

        <dl
          className={`mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground sm:mt-2 sm:flex-col sm:gap-x-0 sm:gap-y-0.5 ${NUMERIC}`}
        >
          <div className="flex gap-1 sm:justify-center">
            <dt className="sr-only">{c('postsLabel')}</dt>
            <dd>
              {author.postCount.label}{' '}
              {author.postCount.value === 1 ? c('post.one') : c('post.other')}
            </dd>
          </div>
          {author.joinedAt !== null && (
            <div className="flex gap-1 sm:justify-center">
              <dt className="sr-only">{c('joined')}</dt>
              <dd>
                {c('joined')} <Stamp at={author.joinedAt} />
              </dd>
            </div>
          )}
          {author.reputation != null && (
            <div className="flex gap-1 sm:justify-center">
              <dt className="sr-only">{c('reputationLabel')}</dt>
              <dd>
                {author.reputation.label} {c('reputation')}
              </dd>
            </div>
          )}
        </dl>

        {author.fields.length > 0 && (
          <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:mt-1.5 sm:flex-col sm:gap-x-0">
            {author.fields.map((field) => (
              <div key={field.label} className="flex min-w-0 gap-1 sm:justify-center">
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

export function PostBit({ post, select, regions, copy }: PostBitSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.postBit.${key}`)

  const actions = regions.actions !== null && !isEmptyRegion(regions.actions)
  const pluginFooter = !isEmptyRegion(regions.pluginFooter)

  return (
    <Card
      as="article"
      id={`post-${post.number}`}
      data-post-id={post.id}
      data-visibility={post.visibility}
      className={cn(
        'target:border-primary/60 target:ring-2 target:ring-primary/20',
        VISIBILITY_TINT[post.visibility],
      )}
    >
      <StatusBanner visibility={post.visibility} copy={copy} />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:grid-rows-[auto_minmax(0,1fr)]">
        <div className="col-start-1 row-start-1 min-w-0 border-b border-border py-3 pl-4 sm:row-span-2 sm:border-r sm:border-b-0 sm:bg-surface/60 sm:px-4 sm:py-4">
          <AuthorBlock author={post.author} badges={regions.pluginBadges} copy={copy} />
        </div>

        <div
          className={`col-start-2 row-start-1 flex flex-col-reverse items-end justify-center gap-1.5 border-b border-border py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:py-1.5 ${BODY_X}`}
        >
          {select === null ? (
            <span className="hidden sm:block" />
          ) : (
            <label className="flex min-h-6 items-center gap-2">
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

          <a
            href={post.permalink}
            className={`inline-flex min-h-8 items-center gap-2 ${MUTED_LINK} ${NUMERIC}`}
          >
            <Stamp at={post.postedAt} />
            <span className="font-semibold text-primary">#{post.number}</span>
          </a>
        </div>

        <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2">
          {post.ignored !== null ? (
            <div className={`py-5 text-sm text-muted-foreground ${BODY_X}`}>
              {c('ignoringPrefix')}{' '}
              <span className="font-medium text-foreground">{post.ignored.authorUsername}</span>.{' '}
              {c('hiddenNotice')}{' '}
              <a href={post.ignored.revealHref} className={`font-medium text-foreground ${LINK}`}>
                {c('showAnyway')}
              </a>
            </div>
          ) : (
            <div className={`py-4 sm:py-5 ${BODY_X}`}>
              <div
                className="prose-md text-[0.9375rem] sm:text-base"
                dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
              />

              {post.editedNote !== null && (
                <p className="mt-4 border-t border-border pt-2 text-xs text-muted-foreground">
                  {post.editedNote}
                </p>
              )}
            </div>
          )}

          {post.attachments.length > 0 && (
            <div className={`border-t border-border py-3 ${BODY_X}`}>
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {post.attachments.length}{' '}
                {post.attachments.length === 1 ? c('attachment.one') : c('attachment.other')}
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

          {post.ignored === null && post.author.signatureHtml !== null && (
            <div
              className={`prose-md border-t border-border py-2.5 text-xs text-muted-foreground ${BODY_X}`}
              dangerouslySetInnerHTML={{ __html: post.author.signatureHtml }}
            />
          )}

          {pluginFooter && (
            <div className={`border-t border-border py-2 text-xs empty:hidden ${BODY_X}`}>
              {regions.pluginFooter}
            </div>
          )}

          {actions && (
            <footer className={`border-t border-border py-1.5 empty:hidden ${BODY_X}`}>
              {regions.actions}
            </footer>
          )}
        </div>
      </div>
    </Card>
  )
}
