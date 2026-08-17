import type { OnlineMemberModel, WhoIsOnlineModel } from '@meith/theme-kit'
import { Badge } from '@meith/ui'

import { LINK, MICRO, NUMERIC, Stamp, UserRef } from '../shared'

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
      className="flex flex-col gap-1.5 text-xs text-muted-foreground"
    >
      <h2 id="who-is-online-heading" className={MICRO}>
        In the clubhouse
      </h2>

      <p className={NUMERIC}>
        <span className="font-semibold text-foreground">{total.label}</span> online —{' '}
        {memberCount.label} {memberCount.value === 1 ? 'member' : 'members'}, {guestCount.label}{' '}
        {guestCount.value === 1 ? 'guest' : 'guests'}
      </p>

      {memberCount.value === 0 ? (
        <p>
          {guestCount.value === 0
            ? 'Nobody is reading the board right now.'
            : 'Only guests are reading the board right now.'}
        </p>
      ) : (
        <p className="min-w-0">
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
        </p>
      )}

      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={fullListHref} className={`font-semibold text-foreground ${LINK}`}>
          See everyone online
        </a>
        {recordAt !== null && (
          <span className={`ms-auto ${NUMERIC}`}>
            Record: {recordCount.label} on <Stamp at={recordAt} />
          </span>
        )}
      </p>
    </section>
  )
}

function Name({ member, first }: { member: OnlineMemberModel; first: boolean }) {
  return (
    <>
      {!first && ', '}
      <UserRef user={member} className="font-medium" />
      {member.isInvisible && (
        <>
          {' '}
          <Badge tone="neutral">Invisible</Badge>
        </>
      )}
    </>
  )
}
