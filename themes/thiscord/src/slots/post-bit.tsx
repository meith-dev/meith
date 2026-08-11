import { cn } from '@meith/ui'
import type { PostBitSlotModel } from '@meith/theme-kit'

import { Circle, LINK, MUTED_LINK, NUMERIC, OnlineDot, Stamp, Tag, UserRef, count } from '../shared'

type Post = PostBitSlotModel['post']

const VISIBILITY_TINT = {
  visible: '',
  unapproved: 'bg-post-unapproved',
  deleted: 'bg-destructive/8',
} as const

function StatusBanner({ visibility }: { visibility: Post['visibility'] }) {
  if (visibility === 'visible') return null

  const deleted = visibility === 'deleted'

  return (
    <p
      className={cn(
        'mb-1 text-xs font-bold',
        deleted ? 'text-thread-deleted' : 'text-thread-unapproved',
      )}
    >
      {deleted ? 'Deleted post.' : 'Waiting for approval.'}{' '}
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
    <div className="mt-2 flex flex-col gap-2">
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
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
                  className="max-h-80 w-auto rounded-lg border border-border object-contain"
                />
              </a>
            </li>
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rest.map((file) => (
            <li key={file.id} className="min-w-0">
              <a
                href={file.href}
                className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 text-xs transition-colors hover:border-primary"
              >
                <span className="truncate font-medium text-primary">{file.filename}</span>
                <span className="shrink-0 text-muted-foreground">{file.size}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
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
        'group relative flex gap-3 px-4 py-2 transition-colors hover:bg-accent/60',
        VISIBILITY_TINT[post.visibility],
      )}
    >
      {select !== null && (
        <label className="mt-1 flex shrink-0 items-start">
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

      <span className="relative mt-0.5 shrink-0">
        <Circle src={author.avatarUrl} name={author.username} size={40} />
        {author.isOnline && <OnlineDot />}
      </span>

      <div className="min-w-0 flex-1">
        <StatusBanner visibility={post.visibility} />

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug">
          <UserRef user={author} className="text-[0.9375rem] font-semibold" />
          {author.badge != null && <GroupBadge badge={author.badge} />}
          {author.title !== null && <Tag>{author.title}</Tag>}

          <a href={post.permalink} className={`text-xs ${MUTED_LINK}`}>
            <Stamp at={post.postedAt} />
            <span className={`ml-1.5 ${NUMERIC}`}>#{post.number}</span>
          </a>
        </p>

        {regions.pluginBadges !== undefined && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
            {regions.pluginBadges}
          </p>
        )}

        {post.ignored !== null ? (
          <p className="mt-1 text-sm text-muted-foreground italic">
            You are ignoring{' '}
            <span className="font-medium text-foreground">{post.ignored.authorUsername}</span>. This
            post is hidden.{' '}
            <a href={post.ignored.revealHref} className={LINK}>
              Show it anyway
            </a>
          </p>
        ) : (
          <>
            <div
              className="prose-md mt-0.5 text-[0.9375rem] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />

            {post.editedNote !== null && (
              <p className="mt-1 text-xs text-muted-foreground">{post.editedNote}</p>
            )}
          </>
        )}

        {post.attachments.length > 0 && <Attachments files={post.attachments} />}

        {post.ignored === null && author.signatureHtml !== null && (
          <div
            className="prose-md mt-2 border-t border-border pt-1.5 text-xs text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: author.signatureHtml }}
          />
        )}

        {author.fields.length > 0 && post.ignored === null && (
          <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            {author.fields.map((field) => (
              <div key={field.label} className="flex gap-1">
                <dt className="font-medium">{field.label}:</dt>
                <dd className="truncate">{field.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className={`mt-1 text-xs text-muted-foreground ${NUMERIC}`}>
          {count(author.postCount)} posts
          {author.reputation != null && <> · {count(author.reputation)} rep</>}
        </p>

        {regions.pluginFooter !== undefined && (
          <div className="mt-1.5 text-xs empty:hidden">{regions.pluginFooter}</div>
        )}

        {regions.actions !== null && (
          <footer className="mt-1.5 transition-opacity empty:hidden sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {regions.actions}
          </footer>
        )}
      </div>
    </article>
  )
}
