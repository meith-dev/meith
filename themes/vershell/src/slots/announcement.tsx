import type { AnnouncementModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import {
  BODY_MEASURE,
  CARD,
  Label,
  META,
  QUIET_LINK,
  SECTION_TITLE,
  Stamp,
  UserRef,
} from '../shared'

export function Announcement({
  title,
  bodyHtml,
  postedBy,
  postedAt,
  forum,
  copy,
}: AnnouncementModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `vershell.announcement.${key}`)

  return (
    <article className={`${CARD} p-5 sm:p-6`}>
      <Label>{c('label')}</Label>
      <h2 className={`${SECTION_TITLE} mt-3 text-balance`}>{title}</h2>

      <div
        className={`prose-md mt-4 ${BODY_MEASURE} text-[0.9375rem] leading-[1.7]`}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      <p className={`${META} mt-5 flex flex-wrap items-center gap-x-3`}>
        <span>
          {postedBy === null ? (
            c('posted')
          ) : (
            <>
              {c('postedBy')} <UserRef user={postedBy} />
            </>
          )}{' '}
          <Stamp at={postedAt} />
        </span>

        {forum !== null && (
          <>
            <span aria-hidden="true" className="text-input">
              {c('dot')}
            </span>
            <a href={forum.href} className={QUIET_LINK}>
              {forum.label}
            </a>
          </>
        )}
      </p>
    </article>
  )
}
