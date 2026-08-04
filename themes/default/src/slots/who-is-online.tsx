import type { WhoIsOnlineModel } from '@meith/theme-kit'

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
    <section
      aria-labelledby="who-is-online-heading"
      className="rounded-lg border border-border p-4"
    >
      <h2 id="who-is-online-heading" className="font-serif text-lg font-semibold">
        Who&rsquo;s online
      </h2>

      <p className="mt-2 text-sm text-muted-foreground">
        {total.toLocaleString()} online — {members.length.toLocaleString()}{' '}
        {members.length === 1 ? 'member' : 'members'} and {guestCount.toLocaleString()}{' '}
        {guestCount === 1 ? 'guest' : 'guests'}.
      </p>

      {members.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {members.map((member) => (
            <li key={member.userId ?? member.username}>
              {member.profileHref === null ? (
                <span>{member.username}</span>
              ) : (
                <a href={member.profileHref} className="text-primary hover:underline">
                  {member.username}
                </a>
              )}
              {member.isInvisible && (
                /* Text, not a colour: "hidden" is information, and information
                   that exists only as a hue is absent for many readers. */
                <span className="ml-1 text-xs text-muted-foreground">(invisible)</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {recordAt !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Most ever online: {recordCount.toLocaleString()} on{' '}
          <time dateTime={recordAt.iso}>{recordAt.label}</time>.
        </p>
      )}

      <p className="mt-2 text-sm">
        <a href={fullListHref} className="text-primary hover:underline">
          See who is online and where
        </a>
      </p>
    </section>
  )
}
