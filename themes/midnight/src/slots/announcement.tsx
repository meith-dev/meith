import type { AnnouncementModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

/**
 * One announcement (F71), midnight's take.
 *
 * Same contract, different treatment: this theme leans on a tinted panel rather
 * than the default's left rule, which is the sort of thing a theme is for. What
 * it does *not* vary is the distinction from `Notice` — an announcement reads as
 * a dated statement here too, because styling it as an alert would be a theme
 * deciding what a piece of board content means.
 */
export function Announcement({ title, bodyHtml, postedBy, postedAt, forum }: AnnouncementModel) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4">
      <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>

      <div
        className="prose-md text-sm text-foreground"
        /* Trusted: `@meith/markdown`'s own output, same contract as a post body. */
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
