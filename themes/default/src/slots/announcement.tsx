import { Card, CardContent, CardFooter } from '@meith/ui'
import type { AnnouncementModel } from '@meith/theme-kit'

import { MUTED_LINK, Stamp, UserRef } from '../shared'

/**
 * One announcement (F71).
 *
 * **Deliberately not styled like `Notice`.** A notice is a flash about what the
 * viewer just did; this is a dated statement addressed to everybody, and giving
 * them the same treatment would train people to dismiss one as the other. So it
 * reads as a small article — a heading, a body, and an attribution line — rather
 * than as an alert bar, and it carries the leading rule that marks it as the
 * board speaking rather than the page reporting.
 *
 * `bodyHtml` is trusted markup from `@meith/markdown`'s own renderer, the same
 * contract a post body carries, which is why it is inserted rather than escaped.
 * A theme must never be handed member-supplied text to insert; this is not that.
 */
export function Announcement({ title, bodyHtml, postedBy, postedAt, community }: AnnouncementModel) {
  return (
    <Card as="article" className="border-l-4 border-l-foreground">
      <CardContent className="flex flex-col gap-2 p-4">
        <h2 className="text-lg font-semibold tracking-tight text-balance">{title}</h2>

        <div
          className="prose-md text-sm"
          /* Trusted: the renderer's own output. See the note above. */
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </CardContent>

      <CardFooter>
        <span>
          {postedBy === null ? (
            'Posted'
          ) : (
            <>
              {'Posted by '}
              {/* A deleted account keeps its name and loses its link (F31). */}
              <UserRef user={postedBy} className="text-foreground" />
            </>
          )}{' '}
          <Stamp at={postedAt} />
        </span>

        {community !== null && (
          <>
            <span aria-hidden="true">·</span>
            <a href={community.href} className={MUTED_LINK}>
              {community.label}
            </a>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
