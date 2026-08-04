import type { AnnouncementModel } from '@meith/theme-kit'

/**
 * One announcement (F71).
 *
 * **Deliberately not styled like `Notice`.** A notice is a flash about what the
 * viewer just did; this is a dated statement addressed to everybody, and giving
 * them the same treatment would train people to dismiss one as the other. So it
 * reads as a small article — a heading, a body, and an attribution line —
 * rather than as an alert bar.
 *
 * `bodyHtml` is trusted markup from `@meith/bbcode`'s own renderer, the same
 * contract a post body carries, which is why it is inserted rather than escaped.
 * A theme must never be handed member-supplied text to insert; this is not that.
 */
export function Announcement({ title, bodyHtml, postedBy, postedAt, forum }: AnnouncementModel) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-l-4 border-l-primary border-border bg-card p-4 text-card-foreground">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>

      <div
        className="prose-bb text-sm"
        /* Trusted: the renderer's own output. See the note above. */
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      <p className="text-xs text-muted-foreground">
        {postedBy === null ? (
          'Posted'
        ) : (
          <>
            Posted by{' '}
            {/* A deleted account keeps its name and loses its link (F31). */}
            {postedBy.profileHref === null ? (
              <span className="font-medium">{postedBy.username}</span>
            ) : (
              <a href={postedBy.profileHref} className="text-primary hover:underline">
                {postedBy.username}
              </a>
            )}
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
