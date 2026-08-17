import type { WhoIsOnlineModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function WhoIsOnline({
  guestCount,
  members,
  memberCount,
  total,
  recordCount,
  recordAt,
  fullListHref,
}: WhoIsOnlineModel) {
  return (
    <section aria-labelledby="who-is-online-heading" className="border border-border">
      <h2
        id="who-is-online-heading"
        className="border-b border-border bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-wide"
      >
        Online now — {total.label}
      </h2>
      <p className="px-3 py-2 text-xs">
        {memberCount.value === 0 ? (
          <span className="text-muted-foreground">no members</span>
        ) : (
          members.map((member, index) => (
            <span key={member.username}>
              {index > 0 && ', '}
              <UserRef user={member} className="text-primary hover:underline" />
              {member.isInvisible && (
                <span className="ml-1 font-mono text-muted-foreground">(hidden)</span>
              )}
            </span>
          ))
        )}
        <span className="text-muted-foreground">
          {' · '}
          {guestCount.label} guests
        </span>
      </p>
      <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
        <a href={fullListHref} className="hover:text-foreground">
          full list
        </a>
        {' · record '}
        {recordCount.label}
        {recordAt !== null && (
          <>
            {' on '}
            <time dateTime={recordAt.iso}>{recordAt.label}</time>
          </>
        )}
      </p>
    </section>
  )
}
