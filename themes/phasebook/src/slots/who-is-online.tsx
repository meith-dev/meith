import type { OnlineMemberModel, WhoIsOnlineModel } from '@meith/theme-kit'

import {
  Circle,
  count,
  MUTED_LINK,
  NUMERIC,
  OnlineDot,
  plural,
  Rail,
  Stamp,
  Tag,
  UserRef,
} from '../shared'

const VISIBLE_NAMES = 8

function Row({ member }: { member: OnlineMemberModel }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent">
      <span className="relative shrink-0">
        <Circle name={member.username} size={32} />
        <OnlineDot />
      </span>

      <span className="min-w-0 flex-1 truncate text-sm">
        <UserRef user={member} className="text-sm" />
        {member.location.href === null ? (
          <span className="block truncate text-xs text-muted-foreground">
            {member.location.label}
          </span>
        ) : (
          <a href={member.location.href} className={`block truncate text-xs ${MUTED_LINK}`}>
            {member.location.label}
          </a>
        )}
      </span>

      {member.isInvisible && <Tag>Invisible</Tag>}
    </li>
  )
}

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
  const hidden = members.length - shown.length

  return (
    <Rail
      title="Online now"
      titleId="who-is-online-heading"
      action={
        <a href={fullListHref} className={`text-xs font-semibold ${MUTED_LINK}`}>
          See all
        </a>
      }
    >
      <p className={`px-3 text-xs text-muted-foreground ${NUMERIC}`}>
        {count(total)} online — {count(memberCount)} {plural(memberCount, 'member', 'members')},{' '}
        {count(guestCount)} {plural(guestCount, 'guest', 'guests')}
      </p>

      {memberCount.value === 0 ? (
        <p className="px-3 pt-2 pb-3 text-xs text-muted-foreground">
          {guestCount.value === 0
            ? 'Nobody is reading the board right now.'
            : 'Only guests are reading the board right now.'}
        </p>
      ) : (
        <ul className="px-1 pt-1 pb-1">
          {shown.map((member) => (
            <Row key={member.userId ?? member.username} member={member} />
          ))}
          {hidden > 0 && (
            <li className="px-2 py-1.5">
              <a href={fullListHref} className={`text-xs font-semibold ${MUTED_LINK}`}>
                and {hidden} more
              </a>
            </li>
          )}
        </ul>
      )}

      {recordAt !== null && (
        <p className={`border-t border-border px-3 py-2 text-xs text-muted-foreground ${NUMERIC}`}>
          Record: {count(recordCount)} on <Stamp at={recordAt} />
        </p>
      )}
    </Rail>
  )
}
