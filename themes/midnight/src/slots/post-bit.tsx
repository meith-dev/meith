import type { PostBitSlotModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { UserRef } from '../shared'

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

function StatusBanner({
  visibility,
  copy,
}: {
  visibility: PostBitSlotModel['post']['visibility']
  copy: SlotCopy
}) {
  if (visibility === 'visible') return null
  const c = (key: string) => fromSlotCopy(copy, `midnight.postBit.${key}`)
  return (
    <p className="border-b border-border bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
      {visibility === 'deleted' ? c('deleted') : c('unapproved')}
    </p>
  )
}

export function PostBit({ post, select, regions, copy }: PostBitSlotModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.postBit.${key}`)

  return (
    <article id={`post-${post.number}`} data-post-id={post.id} className="border border-border">
      <StatusBanner visibility={post.visibility} copy={copy} />

      <div className="grid grid-cols-1 sm:grid-cols-[11rem_1fr]">
        <div className="border-b border-border bg-secondary px-3 py-2 sm:border-b-0 sm:border-r">
          <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
            {post.author.avatarUrl !== null && (
              <img
                src={post.author.avatarUrl}
                alt=""
                width={48}
                height={48}
                className="size-12 shrink-0 border border-border object-cover sm:size-16"
              />
            )}

            <div className="min-w-0 flex-1 sm:flex-none">
              <p className="flex items-center gap-2 sm:justify-center">
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
                <UserRef
                  user={post.author}
                  className={
                    post.author.profileHref === null
                      ? 'font-medium'
                      : 'font-medium hover:text-primary'
                  }
                />
              </p>

              {regions.pluginBadges}

              {post.author.badge != null && (
                <p className="mt-1 flex sm:justify-center">
                  <GroupBadge badge={post.author.badge} />
                </p>
              )}
              {post.author.title !== null && (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {post.author.title}
                </p>
              )}
              <dl className="mt-2 font-mono text-xs text-muted-foreground">
                <div className="flex gap-1 sm:justify-center">
                  <dt>{c('posts')}</dt>
                  <dd className="text-foreground">{post.author.postCount.label}</dd>
                </div>
                {post.author.joinedAt !== null && (
                  <div className="flex gap-1 sm:justify-center">
                    <dt>{c('joined')}</dt>
                    <dd>
                      <time dateTime={post.author.joinedAt.iso}>{post.author.joinedAt.label}</time>
                    </dd>
                  </div>
                )}
                {post.author.reputation != null && (
                  <div className="flex gap-1 sm:justify-center">
                    <dt>{c('rep')}</dt>
                    <dd className="text-foreground">{post.author.reputation.label}</dd>
                  </div>
                )}
                {post.author.isOnline && (
                  <div className="text-forum-unread sm:text-center">{c('online')}</div>
                )}
              </dl>

              {post.author.fields.length > 0 && (
                <dl className="mt-2 font-mono text-xs text-muted-foreground">
                  {post.author.fields.map((field) => (
                    <div key={field.label} className="flex gap-1 sm:justify-center">
                      <dt>{field.label}</dt>
                      <dd className="text-foreground">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-1 font-mono text-xs text-muted-foreground">
            <time dateTime={post.postedAt.iso}>{post.postedAt.label}</time>
            <a href={post.permalink} className="hover:text-foreground">
              #{post.number}
            </a>
          </div>

          {post.ignored !== null ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {c('ignoredPrefix')} {post.ignored.authorUsername}
              {c('ignoredSuffix')}{' '}
              <a href={post.ignored.revealHref} className="text-primary hover:underline">
                {c('showIt')}
              </a>
            </p>
          ) : (
            <>
              <div
                className="prose-md px-3 py-3 text-sm"
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

          {regions.pluginFooter !== undefined && regions.pluginFooter !== null && (
            <div className="border-t border-border px-3 py-1 font-mono text-xs">
              {regions.pluginFooter}
            </div>
          )}

          {regions.actions !== null && (
            <div className="border-t border-border px-3 py-1">{regions.actions}</div>
          )}
        </div>
      </div>
    </article>
  )
}
