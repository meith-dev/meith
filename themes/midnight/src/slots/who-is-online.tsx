import type { SlotCopy, WhoIsOnlineModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { UserRef } from '../shared'

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
  const c = (key: string) => fromSlotCopy(copy, `midnight.whoIsOnline.${key}`)

  return (
    <section aria-labelledby="who-is-online-heading" className="border border-border">
      <h2
        id="who-is-online-heading"
        className="border-b border-border bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-wide"
      >
        {c('onlineNow')} {total.label}
      </h2>
      <p className="px-3 py-2 text-xs">
        {memberCount.value === 0 ? (
          <span className="text-muted-foreground">{c('noMembers')}</span>
        ) : (
          members.map((member, index) => (
            <span key={member.username}>
              {index > 0 && ', '}
              <UserRef user={member} className="text-primary hover:underline" />
              {member.isInvisible && (
                <span className="ml-1 font-mono text-muted-foreground">{c('hidden')}</span>
              )}
            </span>
          ))
        )}
        <span className="text-muted-foreground">
          {' · '}
          {guestCount.label} {c('guests')}
        </span>
      </p>
      <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
        <a href={fullListHref} className="hover:text-foreground">
          {c('fullList')}
        </a>
        {' · '}
        {c('record')} {recordCount.label}
        {recordAt !== null && (
          <>
            {' '}
            {c('on')} <time dateTime={recordAt.iso}>{recordAt.label}</time>
          </>
        )}
      </p>
    </section>
  )
}
