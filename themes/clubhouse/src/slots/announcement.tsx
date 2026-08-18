import type { AnnouncementModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, CardContent, CardFooter } from '@meith/ui'

import { ClubBar, HEADING, MICRO, MUTED_LINK, Stamp, UserRef } from '../shared'

export function Announcement({
  title,
  bodyHtml,
  postedBy,
  postedAt,
  forum,
  copy,
}: AnnouncementModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.announcement.${key}`)

  return (
    <Card as="article" className="flex items-stretch">
      <ClubBar />

      <div className="min-w-0 flex-1">
        <CardContent className="flex flex-col gap-1.5 px-4 py-3">
          <p className={MICRO}>{c('clubNotice')}</p>

          <h2 className={`${HEADING} text-base text-balance`}>{title}</h2>

          <div className="prose-md text-sm" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </CardContent>

        <CardFooter>
          <span>
            {postedBy === null ? (
              c('posted')
            ) : (
              <>
                {c('postedBy')} <UserRef user={postedBy} className="text-foreground" />
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
