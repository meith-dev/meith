import type { OnlineMemberModel, SlotCopy, WhoIsOnlineModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { LABEL, Mark, NUMERIC, QUIET_LINK, Stamp, UserRef } from '../shared'

const VISIBLE_NAMES = 12

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
  const shown = members.slice(0, VISIBLE_NAMES)
  const rest = members.slice(VISIBLE_NAMES)

  const c = (key: string) => fromSlotCopy(copy, `vershell.whoIsOnline.${key}`)

  return (
    <section
      aria-labelledby="who-is-online-heading"
      className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-6"
    >
      <h2 id="who-is-online-heading" className={`${LABEL} shrink-0`}>
        {c('heading')}
      </h2>

      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={NUMERIC}>
          <span className="text-foreground">{total.label}</span> {c('online')} {memberCount.label}{' '}
          {memberCount.value === 1 ? c('member.one') : c('member.other')}
          {', '}
          {guestCount.label} {guestCount.value === 1 ? c('guest.one') : c('guest.other')}
        </span>

        {memberCount.value === 0 ? (
          <span>{guestCount.value === 0 ? c('nobody') : c('onlyGuests')}</span>
        ) : (
          <div className="min-w-0">
            {shown.map((member, index) => (
              <Name
                key={member.userId ?? member.username}
                member={member}
                first={index === 0}
                copy={copy}
              />
            ))}

            {rest.length > 0 && (
              <details className="inline">
                <summary
                  className={`inline cursor-default list-none ${QUIET_LINK} [&::-webkit-details-marker]:hidden [&::marker]:content-none`}
                >
                  {' '}
                  {c('and')} <span className={NUMERIC}>{rest.length}</span> {c('more')}
                </summary>
                {': '}
                {rest.map((member, index) => (
                  <Name
                    key={member.userId ?? member.username}
                    member={member}
                    first={index === 0}
                    copy={copy}
                  />
                ))}
              </details>
            )}
          </div>
        )}
      </div>

      <span className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <a href={fullListHref} className={`font-medium text-foreground ${QUIET_LINK}`}>
          {c('seeEveryone')}
        </a>
        {recordAt !== null && (
          <span className={NUMERIC}>
            {c('record')} {recordCount.label} {c('on')} <Stamp at={recordAt} />
          </span>
        )}
      </span>
    </section>
  )
}

function Name({
  member,
  first,
  copy,
}: {
  member: OnlineMemberModel
  first: boolean
  copy: SlotCopy
}) {
  return (
    <>
      {!first && ', '}
      <UserRef user={member} />
      {member.isInvisible && (
        <>
          {' '}
          <Mark>{fromSlotCopy(copy, 'vershell.whoIsOnline.invisible')}</Mark>
        </>
      )}
    </>
  )
}
