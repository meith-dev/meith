import { Badge } from '@meith/ui'
import type { OnlineMemberModel, WhoIsOnlineModel } from '@meith/theme-kit'

import { LINK, NUMERIC, Stamp, UserRef } from '../shared'

/**
 * Who is on the board (F75).
 *
 * The theme renders what it is given and can leak nothing it was not: every
 * member on this list arrives **already resolved against this reader**, and an
 * invisible member is absent from the list *and* from the total for everybody
 * but staff — which is what makes invisibility real rather than a subtraction
 * puzzle.
 *
 * ## It is a line at the foot of the index, and it is a list of names
 *
 * This used to be a card rendering a row per member — name, where they are,
 * when they were last seen. That is the right shape for `/online`, which is a
 * page, and the wrong shape anywhere on the index: on a board with sixty people
 * reading, three lines each is four screens of sidebar and everything under it
 * is unreachable.
 *
 * The information is not dropped, which is the distinction that matters here:
 * `/online` shows all of it, and this line links to it. What the footer carries
 * is the question a footer can answer at a glance — *who* is here, not what
 * each of them is doing.
 *
 * ## The collapse is `<details>`, and that is the whole implementation
 *
 * The first `VISIBLE_NAMES` are always shown; the rest sit behind a native
 * disclosure. The browser toggles it, the keyboard works, a screen reader
 * announces it as expandable and reports its state, and it costs no JavaScript
 * at all — the same argument `@meith/ui`'s `Disclosure` makes at greater
 * length. `Disclosure` itself is not used because it is a bordered card, which
 * is the thing this stopped being.
 *
 * The names are an inline run rather than a stacked list on purpose: a comma
 * between names is what makes "a few lines" mean forty people rather than four.
 */

/**
 * How many names show before the rest collapse.
 *
 * Twelve, which is a line or two at the width of the page. Enough that a quiet
 * board never shows the toggle at all, and few enough that a busy one does not
 * turn the foot of the index into a directory.
 */
const VISIBLE_NAMES = 12

export function WhoIsOnline({
  guestCount,
  members,
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
        <span className="font-medium text-foreground">{total.toLocaleString('en')}</span> online —{' '}
        {members.length.toLocaleString('en')} {members.length === 1 ? 'member' : 'members'},{' '}
        {guestCount.toLocaleString('en')} {guestCount === 1 ? 'guest' : 'guests'}
      </span>

      {members.length === 0 ? (
        <span>
          {guestCount === 0
            ? 'Nobody is reading the board right now.'
            : 'Only guests are reading the board right now.'}
        </span>
      ) : (
        /*
          A `<div>`, not a `<span>` or a `<p>`. The parser closes an open `<p>`
          the moment it meets a `<details>` — flow content inside phrasing
          content — so the paragraph version renders one DOM on the server and a
          different one in the browser, which is a hydration mismatch on the
          board's most-requested page.
        */
        <div className="min-w-0">
          {shown.map((member, index) => (
            <Name key={member.userId ?? member.username} member={member} first={index === 0} />
          ))}

          {rest.length > 0 && (
            /*
              Inside the same run, so the revealed names continue it rather than
              starting a second list of the same thing. `inline` because a
              `<details>` is a block by default and would otherwise break the
              line before the toggle.
            */
            <details className="inline">
              <summary
                className={`inline cursor-default list-none ${LINK} [&::-webkit-details-marker]:hidden [&::marker]:content-none`}
              >
                {' and '}
                <span className={NUMERIC}>{rest.length.toLocaleString('en')}</span> more
              </summary>
              {/*
                A colon, not a comma, and it is inside the panel so it only
                appears once the panel is open. The run has to read correctly in
                both states: closed it ends "…, maeve and 25 more", and opened
                that has to continue rather than restart — "and 25 more, niall"
                reads as though twenty-five is a name in the list.
              */}
              {': '}
              {rest.map((member, index) => (
                <Name
                  key={member.userId ?? member.username}
                  member={member}
                  first={index === 0}
                />
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
            Record: {recordCount.toLocaleString('en')} on <Stamp at={recordAt} />
          </span>
        )}
      </span>
    </section>
  )
}

/**
 * One name in the run, with its separator.
 *
 * The separator belongs to the name rather than to the loop because the run is
 * built in two places — before the toggle and inside it — and an `index > 0`
 * test in each would put a comma at the start of the revealed half or leave one
 * missing between the halves, depending on which way it was written.
 */
function Name({ member, first }: { member: OnlineMemberModel; first: boolean }) {
  return (
    <>
      {!first && ', '}
      <UserRef user={member} />
      {member.isInvisible && (
        /*
         * Text in a badge, not a colour: "hidden" is information, and
         * information that exists only as a hue is absent for many readers —
         * including the staff this marker is for.
         */
        <>
          {' '}
          <Badge tone="neutral">Invisible</Badge>
        </>
      )}
    </>
  )
}
