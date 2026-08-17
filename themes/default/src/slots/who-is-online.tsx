import type { OnlineMemberModel, WhoIsOnlineModel } from '@meith/theme-kit'
import { Badge } from '@meith/ui'

import { LINK, NUMERIC, Stamp, UserRef } from '../shared'

const VISIBLE_NAMES = 12

export function WhoIsOnline({
  guestCount,
  members,
  memberCount,
  total,
  recordCount,
  recordAt,
  fullListHref,
}: WhoIsOnlineModel) {
  const shown = members.slice(0, VISIBLE_NAMES)
  const rest = members.slice(VISIBLE_NAMES)

  return (
    <section
      aria-labelledby="who-is-online-heading"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <h2 id="who-is-online-heading" className="sr-only">
        Who&rsquo;s online
      </h2>

      <span className={NUMERIC}>
        <span className="font-medium text-foreground">{total.label}</span> online —{' '}
        {memberCount.label} {memberCount.value === 1 ? 'member' : 'members'}, {guestCount.label}{' '}
        {guestCount.value === 1 ? 'guest' : 'guests'}
      </span>

      {memberCount.value === 0 ? (
        <span>
          {guestCount.value === 0
            ? 'Nobody is reading the board right now.'
            : 'Only guests are reading the board right now.'}
        </span>
      ) : (
        <div className="min-w-0">
          {shown.map((member, index) => (
            <Name key={member.userId ?? member.username} member={member} first={index === 0} />
          ))}

          {rest.length > 0 && (
            <details className="inline">
              <summary
                className={`inline cursor-default list-none ${LINK} [&::-webkit-details-marker]:hidden [&::marker]:content-none`}
              >
                {' and '}
                <span className={NUMERIC}>{rest.length}</span> more
              </summary>
              {': '}
              {rest.map((member, index) => (
                <Name key={member.userId ?? member.username} member={member} first={index === 0} />
              ))}
            </details>
          )}
        </div>
      )}

      <span className="ms-auto flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={fullListHref} className={`font-medium text-foreground ${LINK}`}>
          See everyone online
        </a>
        {recordAt !== null && (
          <span className={NUMERIC}>
            Record: {recordCount.label} on <Stamp at={recordAt} />
          </span>
        )}
      </span>
    </section>
  )
}

function Name({ member, first }: { member: OnlineMemberModel; first: boolean }) {
  return (
    <>
      {!first && ', '}
      <UserRef user={member} />
      {member.isInvisible && (
        <>
          {' '}
          <Badge tone="neutral">Invisible</Badge>
        </>
      )}
    </>
  )
}
