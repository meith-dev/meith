import type { AnnouncementModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function Announcement({ title, bodyHtml, postedBy, postedAt, forum }: AnnouncementModel) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4">
      <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>

      <div
        className="prose-md text-sm text-foreground"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      <p className="text-xs text-muted-foreground">
        {postedBy === null ? (
          'Posted'
        ) : (
          <>
            Posted by{' '}
            <UserRef
              user={postedBy}
              className={
                postedBy.profileHref === null ? 'font-medium' : 'text-primary hover:underline'
              }
            />
          </>
        )}{' '}
        <time dateTime={postedAt.iso}>{postedAt.label}</time>
        {forum !== null && (
          <>
            {' · '}
            <a href={forum.href} className="text-primary hover:underline">
              {forum.label}
            </a>
          </>
        )}
      </p>
    </article>
  )
}
