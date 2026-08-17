import type { AnnouncementModel } from '@meith/theme-kit'
import { Card, CardContent, CardFooter } from '@meith/ui'

import { ClubBar, HEADING, MICRO, MUTED_LINK, Stamp, UserRef } from '../shared'

export function Announcement({ title, bodyHtml, postedBy, postedAt, forum }: AnnouncementModel) {
  return (
    <Card as="article" className="flex items-stretch">
      <ClubBar />

      <div className="min-w-0 flex-1">
        <CardContent className="flex flex-col gap-1.5 px-4 py-3">
          <p className={MICRO}>Club notice</p>

          <h2 className={`${HEADING} text-base text-balance`}>{title}</h2>

          <div className="prose-md text-sm" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
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
      </div>
    </Card>
  )
}
