import type { PostBitSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Avatar, cn } from '@meith/ui'

import {
  BODY_MEASURE,
  CARD,
  groupTags,
  isEmptyRegion,
  LABEL,
  Mark,
  META,
  NUMERIC,
  QUIET_LINK,
  RULE,
  Stamp,
  TEXT_LINK,
  TOUCH,
  UserRef,
} from '../shared'

const VISIBILITY_TINT = {
  visible: '',
  unapproved: 'bg-post-unapproved/40',
  deleted: 'bg-destructive/5',
} as const

function StatusBanner({
  visibility,
  copy,
}: {
  visibility: PostBitSlotModel['post']['visibility']
  copy: SlotCopy
}) {
  if (visibility === 'visible') return null

  const c = (key: string) => fromSlotCopy(copy, `vershell.postBit.${key}`)

  return (
    <p
      role={visibility === 'deleted' ? 'alert' : 'status'}
      className={`${META} flex items-baseline gap-2`}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-[0.35em] size-2 shrink-0 rounded-full',
          visibility === 'deleted' ? 'bg-destructive' : 'bg-moderation-pending',
        )}
      />
      <span>
        <span className={`${LABEL} me-2 text-foreground`}>
          {visibility === 'deleted' ? c('deletedPost') : c('waitingApproval')}
        </span>
        {c('staffOnly')}
      </span>
    </p>
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

function Byline({
  author,
  badges,
  copy,
}: {
  author: PostBitSlotModel['post']['author']
  badges: React.ReactNode
  copy: SlotCopy
}) {
  const c = (key: string) => fromSlotCopy(copy, `vershell.postBit.${key}`)

  return (
    <div className="flex min-w-0 gap-3 sm:flex-col sm:gap-3">
      <span className="relative inline-flex w-fit shrink-0 self-start">
        <Avatar
          src={author.avatarUrl}
          name={author.username}
          size={40}
          className="rounded-full sm:size-12"
        />
        {author.isOnline && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-moderation-approved"
          />
        )}
      </span>

      <div className="min-w-0 flex-1 sm:flex-none">
        <p className="truncate text-[0.95rem] leading-snug">
          <UserRef user={author} />
        </p>

        {author.badge != null && (
          <p className="mt-1.5 flex">
            <GroupBadge badge={author.badge} />
          </p>
        )}

        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {groupTags(author.groups, author.title).map((group) => (
            <Mark key={group.title} className={cn('max-w-full truncate', group.nameClass)}>
              {group.title}
            </Mark>
          ))}
        </p>

        {author.isOnline && <p className="sr-only">{c('online')}</p>}

        {badges}

        <dl
          className={`${META} ${NUMERIC} mt-2 flex flex-wrap gap-x-3 text-xs sm:mt-3 sm:flex-col sm:gap-x-0 sm:gap-y-0.5`}
        >
          <div className="flex gap-1">
            <dt className="sr-only">{c('postsLabel')}</dt>
            <dd>
              <span className="text-foreground">{author.postCount.label}</span>{' '}
              {author.postCount.value === 1 ? c('post.one') : c('post.other')}
            </dd>
          </div>
          {author.reputation != null && (
            <div className="flex gap-1">
              <dt className="sr-only">{c('reputationLabel')}</dt>
              <dd>
                <span className="text-foreground">{author.reputation.label}</span> {c('reputation')}
              </dd>
            </div>
          )}
          {author.joinedAt !== null && (
            <div className="flex gap-1">
              <dt className="sr-only">{c('joined')}</dt>
              <dd>
                {c('joined')} <Stamp at={author.joinedAt} />
              </dd>
            </div>
          )}
        </dl>

        {author.fields.length > 0 && (
          <dl
            className={`${META} mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs sm:mt-2 sm:flex-col sm:gap-x-0`}
          >
            {author.fields.map((field) => (
              <div key={field.label} className="flex min-w-0 gap-1">
                <dt className="text-foreground">{field.label}:</dt>
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
  const c = (key: string) => fromSlotCopy(copy, `vershell.postBit.${key}`)

  const actions = regions.actions !== null && !isEmptyRegion(regions.actions)
  const pluginFooter = !isEmptyRegion(regions.pluginFooter)

  return (
    <article
      id={`post-${post.number}`}
      data-post-id={post.id}
      data-visibility={post.visibility}
      className={cn(
        `${CARD} scroll-mt-24 px-5 py-4 target:ring-2 target:ring-primary sm:px-6`,
        VISIBILITY_TINT[post.visibility],
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <a
          href={post.permalink}
          className={`${LABEL} group inline-flex items-center gap-3 transition-colors hover:text-foreground ${TOUCH}`}
        >
          <span className="text-foreground group-hover:text-primary">#{post.number}</span>
          <Stamp at={post.postedAt} />
        </a>

        {select !== null && (
          <label className="flex min-h-6 items-center gap-2">
            <input
              type="checkbox"
              name={select.name}
              value={select.value}
              form={select.formId}
              className="size-4 rounded accent-primary"
            />
            <span className="sr-only">{select.label}</span>
          </label>
        )}
      </div>

      <StatusBanner visibility={post.visibility} copy={copy} />

      <div className={`${RULE} mt-4 grid gap-y-5 pt-5 sm:grid-cols-[10rem_minmax(0,1fr)]`}>
        <div className="max-sm:border-b max-sm:border-border max-sm:pb-5 sm:pe-6">
          <Byline author={post.author} badges={regions.pluginBadges} copy={copy} />
        </div>

        <div className="flex min-w-0 flex-col gap-5 sm:border-l sm:border-border sm:ps-8">
          {post.ignored !== null ? (
            <p className={`${META} ${BODY_MEASURE}`}>
              {c('ignoringPrefix')}{' '}
              <span className="font-medium text-foreground">{post.ignored.authorUsername}</span>.{' '}
              {c('hiddenNotice')}{' '}
              <a href={post.ignored.revealHref} className={TEXT_LINK}>
                {c('showAnyway')}
              </a>
            </p>
          ) : (
            <div className={BODY_MEASURE}>
              <div
                className="prose-md text-[0.9375rem] leading-[1.7]"
                dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
              />

              {post.editedNote !== null && (
                <p className={`${META} ${RULE} mt-5 pt-2 text-xs`}>{post.editedNote}</p>
              )}
            </div>
          )}

          {post.attachments.length > 0 && (
            <div className={`${RULE} ${BODY_MEASURE} pt-4`}>
              <h4 className={`${LABEL} mb-3`}>
                {post.attachments.length}{' '}
                {post.attachments.length === 1 ? c('attachment.one') : c('attachment.other')}
              </h4>
              <ul className="flex flex-wrap gap-4">
                {post.attachments.map((file) => (
                  <li key={file.id} className="max-w-full">
                    <a
                      href={file.href}
                      className={`group block max-w-full text-xs text-muted-foreground ${QUIET_LINK}`}
                    >
                      {file.isImage ? (
                        <img
                          src={file.thumbnailHref ?? file.href}
                          alt={file.filename}
                          width={file.width ?? undefined}
                          height={file.height ?? undefined}
                          loading="lazy"
                          decoding="async"
                          className="mb-1.5 max-h-56 w-auto rounded-md object-contain shadow-[0_0_0_1px_var(--color-border)]"
                        />
                      ) : null}
                      <span className="block truncate">
                        <span className="font-medium text-foreground group-hover:text-primary">
                          {file.filename}
                        </span>{' '}
                        <span className={NUMERIC}>({file.size})</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {post.ignored === null && post.author.signatureHtml !== null && (
            <div
              className={`prose-md ${RULE} ${BODY_MEASURE} pt-3 text-xs text-muted-foreground`}
              dangerouslySetInnerHTML={{ __html: post.author.signatureHtml }}
            />
          )}

          {pluginFooter && (
            <div className={`${RULE} ${BODY_MEASURE} pt-3 text-xs empty:hidden`}>
              {regions.pluginFooter}
            </div>
          )}

          {actions && (
            <footer className={`${RULE} ${BODY_MEASURE} pt-3 empty:hidden`}>
              {regions.actions}
            </footer>
          )}
        </div>
      </div>
    </article>
  )
}
