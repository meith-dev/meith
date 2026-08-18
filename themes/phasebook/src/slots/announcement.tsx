import type { AnnouncementModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Circle, MUTED_LINK, Stamp, Tag, UserRef } from '../shared'

export function Announcement({
  title,
  bodyHtml,
  postedBy,
  postedAt,
  forum,
  copy,
}: AnnouncementModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.announcement.${key}`)

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation">
      <div className="flex items-start gap-2.5 px-4 pt-3">
        <Circle name={postedBy?.username ?? title} size={40} />

        <div className="min-w-0 flex-1">
          <h2 className="text-[0.9375rem] leading-snug font-semibold text-balance">{title}</h2>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {postedBy !== null && <UserRef user={postedBy} className="text-xs" />}
            <Stamp at={postedAt} />
            {forum !== null && (
              <>
                <span aria-hidden="true">·</span>
                <a href={forum.href} className={MUTED_LINK}>
                  {forum.label}
                </a>
              </>
            )}
          </p>
        </div>

        <Tag className="mt-0.5">{c('announcement')}</Tag>
      </div>

      <div
        className="prose-md px-4 pt-2 pb-4 text-[0.9375rem]"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </article>
  )
}
