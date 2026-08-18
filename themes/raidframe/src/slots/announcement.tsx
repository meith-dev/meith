import type { AnnouncementModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Frame, HEADING, MICRO, Stamp, UserRef } from '../shared'

export function Announcement({
  title,
  bodyHtml,
  postedBy,
  postedAt,
  forum,
  copy,
}: AnnouncementModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.announcement.${key}`)

  return (
    <Frame as="article">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
        <span className={`${MICRO} text-primary`}>{c('kicker')}</span>
        {forum !== null && (
          <a href={forum.href} className={`${MICRO} hover:text-primary`}>
            {forum.label}
          </a>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <h2 className={`${HEADING} text-base text-foreground`}>{title}</h2>

        <div
          className="prose-md text-sm text-foreground"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <p className={MICRO}>
          {postedBy === null ? (
            c('postedFallback')
          ) : (
            <>
              {c('postedByPrefix')}
              <UserRef user={postedBy} className="text-primary hover:underline" />
            </>
          )}
          {c('separator')}
          <Stamp at={postedAt} />
        </p>
      </div>
    </Frame>
  )
}
