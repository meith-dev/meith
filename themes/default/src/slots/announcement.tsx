import { Card, CardContent, CardFooter } from '@meith/ui'
import type { AnnouncementModel } from '@meith/theme-kit'

import { MUTED_LINK, Stamp, UserRef } from '../shared'

export function Announcement({ title, bodyHtml, postedBy, postedAt, forum }: AnnouncementModel) {
  return (
    <Card as="article" className="border-l-4 border-l-foreground">
      <CardContent className="flex flex-col gap-2 p-4">
        <h2 className="text-lg font-semibold tracking-tight text-balance">{title}</h2>

        <div
          className="prose-md text-sm"
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
              <UserRef user={postedBy} className="text-foreground" />
            </>
          )}{' '}
          <Stamp at={postedAt} />
        </span>

        {forum !== null && (
          <>
            <span aria-hidden="true">·</span>
            <a href={forum.href} className={MUTED_LINK}>
              {forum.label}
            </a>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
