import type { PostBitSlotModel } from '@meith/theme-kit'

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
    <article id={`post-${post.number}`} data-post-id={post.id} className="border border-border">
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
            <UserRef
              user={post.author}
              className={
                post.author.profileHref === null ? 'font-medium' : 'font-medium hover:text-primary'
              }
            />
          </p>

          {regions.pluginBadges}

          {post.author.badge != null && (
            <p className="mt-1">
              <GroupBadge badge={post.author.badge} />
            </p>
          )}
          {post.author.title !== null && (
            <p className="font-mono text-xs text-muted-foreground">{post.author.title}</p>
          )}
          {post.author.avatarUrl !== null && (
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
              <dd className="text-foreground">{post.author.postCount.label}</dd>
            </div>
            {post.author.joinedAt !== null && (
              <div className="flex gap-1">
                <dt>joined</dt>
                <dd>
                  <time dateTime={post.author.joinedAt.iso}>{post.author.joinedAt.label}</time>
                </dd>
              </div>
            )}
            {post.author.reputation != null && (
              <div className="flex gap-1">
                <dt>rep</dt>
                <dd className="text-foreground">{post.author.reputation.label}</dd>
              </div>
            )}
            {post.author.isOnline && <div className="text-forum-unread">online</div>}
          </dl>

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
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Post from {post.ignored.authorUsername}, who you are ignoring.{' '}
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
