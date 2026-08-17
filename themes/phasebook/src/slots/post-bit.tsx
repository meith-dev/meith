import type { PostBitSlotModel } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import {
  Circle,
  count,
  LINK,
  MUTED_LINK,
  NUMERIC,
  OnlineDot,
  plural,
  Stamp,
  Tag,
  UserRef,
} from '../shared'

type Post = PostBitSlotModel['post']

const VISIBILITY_TINT = {
  visible: '',
  unapproved: 'border-thread-unapproved/50 bg-post-unapproved',
  deleted: 'border-thread-deleted/50 bg-destructive/5',
} as const

function StatusBanner({ visibility }: { visibility: Post['visibility'] }) {
  if (visibility === 'visible') return null

  const deleted = visibility === 'deleted'

  return (
    <p
      className={cn(
        'flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold',
        deleted
          ? 'border-thread-deleted/30 text-thread-deleted'
          : 'border-thread-unapproved/30 text-thread-unapproved',
      )}
    >
      {deleted ? 'Deleted post.' : 'Waiting for approval.'}
      <span className="font-normal text-muted-foreground">Only moderators can see this.</span>
    </p>
  )
}

function GroupBadge({ badge }: { badge: NonNullable<Post['author']['badge']> }) {
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

function Attachments({ files }: { files: Post['attachments'] }) {
  const images = files.filter((file) => file.isImage)
  const rest = files.filter((file) => !file.isImage)

  return (
    <>
      {images.length > 0 && (
        <ul
          className={cn(
            'grid gap-0.5 border-y border-border',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {images.map((file) => (
            <li key={file.id} className="min-w-0">
              <a href={file.href} className="block">
                <img
                  src={file.thumbnailHref ?? file.href}
                  alt={file.filename}
                  width={file.width ?? undefined}
                  height={file.height ?? undefined}
                  loading="lazy"
                  decoding="async"
                  className="max-h-96 w-full bg-surface object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <ul className="flex flex-col gap-1 px-4 py-2.5">
          {rest.map((file) => (
            <li key={file.id} className="min-w-0">
              <a
                href={file.href}
                className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs transition-colors hover:bg-accent"
              >
                <span className="truncate font-semibold text-foreground">{file.filename}</span>
                <span className="shrink-0 text-muted-foreground">{file.size}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function PostBit({ post, select, regions }: PostBitSlotModel) {
  const { author } = post

  return (
    <article
      id={`post-${post.number}`}
      data-post-id={post.id}
      data-visibility={post.visibility}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation',
        VISIBILITY_TINT[post.visibility],
      )}
    >
      <StatusBanner visibility={post.visibility} />

      <header className="flex items-start gap-3.5 px-5 pt-4">
        {select !== null && (
          <label className="mt-3 flex shrink-0 items-start">
            <span className="sr-only">{select.label}</span>
            <input
              type="checkbox"
              name={select.name}
              value={select.value}
              form={select.formId}
              className="size-4 accent-primary"
            />
          </label>
        )}

        <span className="relative shrink-0">
          <Circle src={author.avatarUrl} name={author.username} size={48} />
          {author.isOnline && <OnlineDot />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.9375rem] leading-snug">
            <UserRef user={author} className="text-[0.9375rem]" />
            {author.badge != null && <GroupBadge badge={author.badge} />}
            {author.title !== null && <Tag>{author.title}</Tag>}
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <a href={post.permalink} className={MUTED_LINK}>
              <Stamp at={post.postedAt} />
            </a>
            <span aria-hidden="true">·</span>
            <span className={NUMERIC}>#{post.number}</span>
            {author.isOnline && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-moderation-approved">Online</span>
              </>
            )}
          </p>

          {regions.pluginBadges !== undefined && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 empty:hidden">
              {regions.pluginBadges}
            </p>
          )}
        </div>

        <p
          className={`shrink-0 text-right text-xs leading-relaxed text-muted-foreground ${NUMERIC}`}
        >
          {count(author.postCount)} {plural(author.postCount, 'post', 'posts')}
          {author.reputation != null && (
            <>
              <br />
              {count(author.reputation)} rep
            </>
          )}
        </p>
      </header>

      {post.ignored !== null ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          You are ignoring{' '}
          <span className="font-semibold text-foreground">{post.ignored.authorUsername}</span>. This
          post is hidden.{' '}
          <a href={post.ignored.revealHref} className={LINK}>
            Show it anyway
          </a>
        </p>
      ) : (
        <div className="px-5 pt-3 pb-4">
          <div
            className="prose-md text-[0.9375rem]"
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
          />

          {post.editedNote !== null && (
            <p className="mt-3 text-xs text-muted-foreground">{post.editedNote}</p>
          )}
        </div>
      )}

      {post.attachments.length > 0 && <Attachments files={post.attachments} />}

      {post.ignored === null && author.signatureHtml !== null && (
        <div
          className="prose-md border-t border-border px-4 py-2 text-xs text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: author.signatureHtml }}
        />
      )}

      {author.fields.length > 0 && post.ignored === null && (
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {author.fields.map((field) => (
            <div key={field.label} className="flex gap-1">
              <dt className="font-semibold">{field.label}:</dt>
              <dd className="truncate">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {regions.pluginFooter !== undefined && (
        <div className="border-t border-border px-4 py-2 text-xs empty:hidden">
          {regions.pluginFooter}
        </div>
      )}

      {regions.actions !== null && (
        <footer className="border-t border-border px-2 py-1 empty:hidden">{regions.actions}</footer>
      )}
    </article>
  )
}
