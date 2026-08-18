import type { SlotCopy, WhoIsOnlineModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Frame, MICRO, NUMERIC, PanelHead, Stamp, UserRef } from '../shared'

export function WhoIsOnline({
  guestCount,
  members,
  memberCount,
  total,
  recordCount,
  recordAt,
  fullListHref,
  copy,
}: WhoIsOnlineModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.whoIsOnline.${key}`)

  return (
    <Frame aria-labelledby="who-is-online-heading">
      <PanelHead
        id="who-is-online-heading"
        title={c('heading')}
        aside={
          <span className="inline-flex items-center gap-1.5 border border-moderation-approved/50 bg-moderation-approved/10 px-1.5 py-0.5">
            <span
              aria-hidden="true"
              className="size-1.5 bg-moderation-approved shadow-[0_0_6px_var(--color-moderation-approved)]"
            />
            <span
              className={`${NUMERIC} text-[0.625rem] font-bold tracking-[0.12em] text-moderation-approved uppercase`}
            >
              {total.label} {c('onlineSuffix')}
            </span>
          </span>
        }
      />

      <p className="px-3 py-2.5 text-xs">
        {memberCount.value === 0 ? (
          <span className={MICRO}>{c('noMembers')}</span>
        ) : (
          members.map((member, index) => (
            <span key={member.username}>
              {index > 0 && <span className="text-border">{' | '}</span>}
              <UserRef user={member} className="text-foreground hover:text-primary" />
              {member.isInvisible && <span className={`${MICRO} ml-1`}>{c('hidden')}</span>}
            </span>
          ))
        )}
      </p>

      <p className={`${MICRO} border-t border-border px-3 py-1.5 normal-case`}>
        <a href={fullListHref} className="uppercase hover:text-primary">
          {c('fullList')}
        </a>
        <span className="text-border">{' | '}</span>
        <span className="uppercase">
          {guestCount.label} {c('guests')}
        </span>
        <span className="text-border">{' | '}</span>
        <span className="uppercase">
          {c('record')} {recordCount.label}
        </span>
        {recordAt !== null && (
          <>
            {' '}
            <Stamp at={recordAt} />
          </>
        )}
      </p>
    </Frame>
  )
}
