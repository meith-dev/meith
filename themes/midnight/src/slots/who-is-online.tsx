import type { WhoIsOnlineModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

/**
 * Who is online.
 *
 * `location` arrives **already resolved against the reader** (F75): a community they
 * may not see comes through as a bare label with a null href, so there is
 * nothing here to leak and no check for this theme to get wrong.
 *
 * Invisible members are marked in **text**, not colour — and they only appear at
 * all for staff, because the app removed them from the list and the count
 * together. Showing a member as hidden to somebody who should not know they are
 * here would be worse than not offering the setting.
 */
export function WhoIsOnline({
  guestCount,
  members,
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
        Online now — {total}
      </h2>
      <p className="px-3 py-2 text-xs">
        {members.length === 0 ? (
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
          {guestCount} guests
        </span>
      </p>
      <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
        <a href={fullListHref} className="hover:text-foreground">
          full list
        </a>
        {' · record '}
        {recordCount}
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
