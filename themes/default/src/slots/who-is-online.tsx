import type { OnlineMemberModel, SlotCopy, WhoIsOnlineModel } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
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
  copy,
}: WhoIsOnlineModel & { copy: SlotCopy }) {
  const shown = members.slice(0, VISIBLE_NAMES)
  const rest = members.slice(VISIBLE_NAMES)

  const c = (key: string) => fromSlotCopy(copy, `default.whoIsOnline.${key}`)

  return (
    <section
      aria-labelledby="who-is-online-heading"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <h2 id="who-is-online-heading" className="sr-only">
        {c('heading')}
      </h2>

      <span className={NUMERIC}>
        <span className="font-medium text-foreground">{total.label}</span> {c('online')}{' '}
        {memberCount.label} {memberCount.value === 1 ? c('member.one') : c('member.other')}
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
                className={`inline cursor-default list-none ${LINK} [&::-webkit-details-marker]:hidden [&::marker]:content-none`}
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

      <span className="ms-auto flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={fullListHref} className={`font-medium text-foreground ${LINK}`}>
          {c('seeEveryone')}
        </a>
        {recordAt !== null && (
          <span className={NUMERIC}>
            {c('record')} {recordCount.label} on <Stamp at={recordAt} />
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
          <Badge tone="neutral">{fromSlotCopy(copy, 'default.whoIsOnline.invisible')}</Badge>
        </>
      )}
    </>
  )
}
