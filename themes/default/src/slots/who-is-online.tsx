import {
  Badge,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@meith/ui'
import type { WhoIsOnlineModel } from '@meith/theme-kit'

import { LINK, MUTED_LINK, NUMERIC, Stamp, UserRef } from '../shared'

/**
 * Who is on the board (F75).
 *
 * The theme renders what it is given and can leak nothing it was not: every
 * `location` arrives **already resolved against this reader**, so a forum they
 * may not see is the bare label "in a forum" with no href, decided in the
 * repository rather than here. A slot that received titles and chose which to
 * print would put that decision in every theme anybody writes.
 *
 * The invisible marker only ever appears for staff — for everybody else those
 * members are absent from the list *and* from the total, which is what makes
 * invisibility real rather than a subtraction puzzle.
 *
 * ## Where each member is, which this slot used to throw away
 *
 * `OnlineMemberModel.location` has been in the contract since F75 with a
 * resolved label and href in it, and the previous version of this panel rendered
 * usernames and dropped the rest. That is the failure the rendering-contract
 * suite exists to find and cannot: nothing was broken, a feature was simply
 * invisible, and the repository was doing per-member permission resolution whose
 * result never reached a page.
 *
 * So each member is a line — name, then where they are — instead of a bag of
 * names. It is the same information a board's "who's online" has shown since the
 * nineties, and it is the reason anybody opens the panel: not *how many*, but
 * *what is happening*.
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
    <Card aria-labelledby="who-is-online-heading">
      <CardHeader>
        <CardTitle id="who-is-online-heading">Who&rsquo;s online</CardTitle>
        <p className={`text-xs text-muted-foreground ${NUMERIC}`}>
          {total.toLocaleString('en')} online — {members.length.toLocaleString('en')}{' '}
          {members.length === 1 ? 'member' : 'members'}, {guestCount.toLocaleString('en')}{' '}
          {guestCount === 1 ? 'guest' : 'guests'}
        </p>
      </CardHeader>

      {members.length === 0 ? (
        <Empty className="py-8">
          <EmptyTitle>No members online</EmptyTitle>
          <EmptyDescription>
            {guestCount === 0
              ? 'Nobody is reading the board right now.'
              : 'Only guests are reading the board right now.'}
          </EmptyDescription>
        </Empty>
      ) : (
        <CardContent className="px-0 py-0">
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li
                key={member.userId ?? member.username}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2 text-sm"
              >
                <span className="flex items-baseline gap-2">
                  <UserRef user={member} />
                  {member.isInvisible && (
                    /*
                     * Text in a badge, not a colour: "hidden" is information,
                     * and information that exists only as a hue is absent for
                     * many readers — including the staff this marker is for.
                     */
                    <Badge tone="neutral">Invisible</Badge>
                  )}
                </span>

                <span className="text-xs text-muted-foreground">
                  {member.location.href === null ? (
                    member.location.label
                  ) : (
                    <a href={member.location.href} className={MUTED_LINK}>
                      {member.location.label}
                    </a>
                  )}
                  {' · '}
                  <Stamp at={member.lastSeen} />
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}

      <CardFooter className="justify-between">
        <a href={fullListHref} className={`font-medium text-foreground ${LINK}`}>
          See everyone online
        </a>
        {recordAt !== null && (
          <span className={NUMERIC}>
            Record: {recordCount.toLocaleString('en')} on <Stamp at={recordAt} />
          </span>
        )}
      </CardFooter>
    </Card>
  )
}
