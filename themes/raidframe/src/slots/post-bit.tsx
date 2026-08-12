import type { ReactNode } from 'react'

import type { PostBitSlotModel } from '@meith/theme-kit'

import { HEADING, MICRO, NUMERIC, Stamp, UserRef } from '../shared'

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

function StatusBanner({ visibility }: { visibility: PostBitSlotModel['post']['visibility'] }) {
  if (visibility === 'visible') return null

  return (
    <p
      className={`${MICRO} border-b border-border px-3 py-1.5 ${
        visibility === 'deleted' ? 'bg-thread-deleted/10' : 'bg-post-unapproved'
      }`}
    >
      {visibility === 'deleted'
        ? 'purged — moderators only'
        : 'held for review — moderators only'}
    </p>
  )
}

function StatLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-border/60 py-0.5">
      <dt className={MICRO}>{label}</dt>
      <dd className={`${NUMERIC} text-[0.6875rem] text-foreground`}>{children}</dd>
    </div>
  )
}

export function PostBit({ post, select, regions }: PostBitSlotModel) {
  return (
    <article
      id={`post-${post.number}`}
      data-post-id={post.id}
      className="relative border border-border bg-card shadow-elevation"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-px -left-px size-2 border-t-2 border-l-2 border-primary/70"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-px -bottom-px size-2 border-r-2 border-b-2 border-primary/70"
      />

      <StatusBanner visibility={post.visibility} />

      <div className="grid grid-cols-1 sm:grid-cols-[12rem_1fr]">
        <div className="border-b border-border bg-surface px-3 py-3 sm:border-r sm:border-b-0">
          <div className="flex items-start gap-2">
            {select !== null && (
              <label className="flex items-center pt-1">
                <span className="sr-only">{select.label}</span>
                <input
                  type="checkbox"
                  name={select.name}
                  value={select.value}
                  form={select.formId}
                  className="size-3.5 accent-primary"
                />
              </label>
            )}

            {post.author.avatarUrl !== null && (
              <span className="relative inline-block shrink-0 border border-primary/50 p-0.5">
                <img
                  src={post.author.avatarUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 object-cover"
                />
              </span>
            )}

            <div className="min-w-0">
              <p>
                <UserRef
                  user={post.author}
                  className={`${HEADING} text-sm ${
                    post.author.profileHref === null ? '' : 'hover:text-primary'
                  }`}
                />
              </p>
              {post.author.title !== null && (
                <p className={`${MICRO} mt-0.5 text-primary/90`}>{post.author.title}</p>
              )}
              {post.author.isOnline && (
                <p className="mt-1 inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-1.5 bg-moderation-approved shadow-[0_0_6px_var(--color-moderation-approved)]"
                  />
                  <span
                    className={`${MICRO} text-moderation-approved`}
                  >
                    online
                  </span>
                </p>
              )}
            </div>
          </div>

          {regions.pluginBadges}

          {post.author.badge != null && (
            <p className="mt-2">
              <GroupBadge badge={post.author.badge} />
            </p>
          )}

          <dl className="mt-2.5">
            <StatLine label="posts">{post.author.postCount}</StatLine>
            {post.author.reputation != null && (
              <StatLine label="rep">{post.author.reputation}</StatLine>
            )}
            {post.author.joinedAt !== null && (
              <StatLine label="joined">
                <Stamp at={post.author.joinedAt} />
              </StatLine>
            )}
            {post.author.fields.map((field) => (
              <StatLine key={field.label} label={field.label}>
                {field.value}
              </StatLine>
            ))}
          </dl>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-1.5">
            <Stamp at={post.postedAt} className={`${MICRO} normal-case`} />
            <a
              href={post.permalink}
              className={`${NUMERIC} text-[0.6875rem] font-bold text-primary hover:underline`}
            >
              #{post.number}
            </a>
          </div>

          {post.ignored !== null ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Post from {post.ignored.authorUsername}, who you have muted.{' '}
              <a href={post.ignored.revealHref} className="text-primary hover:underline">
                Show it
              </a>
            </p>
          ) : (
            <>
              <div
                className="prose-md px-3 py-3 text-sm"
                dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
              />

              {post.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
                  {post.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        href={attachment.href}
                        className="inline-flex items-center gap-2 border border-border bg-surface px-2 py-1 font-mono text-[0.625rem] tracking-[0.1em] uppercase hover:border-primary/60 hover:text-primary"
                      >
                        {attachment.filename}
                        <span className={`${NUMERIC} text-muted-foreground`}>
                          {attachment.size}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {post.author.signatureHtml !== null && (
                <div
                  className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: post.author.signatureHtml }}
                />
              )}
            </>
          )}

          {post.editedNote !== null && (
            <p className={`${MICRO} border-t border-border px-3 py-1.5 normal-case`}>
              {post.editedNote}
            </p>
          )}

          {regions.pluginFooter !== undefined && regions.pluginFooter !== null && (
            <div className="border-t border-border px-3 py-1.5 text-xs">{regions.pluginFooter}</div>
          )}

          {regions.actions !== null && (
            <div className="border-t border-border bg-surface/60 px-3 py-1.5 empty:hidden">
              {regions.actions}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
