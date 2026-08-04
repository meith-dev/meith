/**
 * Timestamp formatting for view models (F25/F29/F57).
 *
 * Every date a theme renders arrives as a `TimeModel` — the ISO value for
 * `<time datetime>` and a string a human reads — and this is the only place the
 * second one is produced.
 *
 * ## Why the app formats and the theme does not
 *
 * A theme calling `toLocaleString()` renders one string on the server and a
 * different one in the browser, because the two are in different timezones. That
 * is a hydration mismatch that only appears for users outside the server's zone,
 * which means it survives review, CI, and the developer's own machine.
 *
 * So formatting happens once, server-side, in a zone the page states out loud
 * (the footer says which).
 *
 * ## The zone is the member's, as of F57
 *
 * Until F57 that zone was **UTC** for everybody — chosen over the server's local
 * zone because the server's zone is an accident of where it is deployed, and a
 * board that renders different times after a region migration is worse than one
 * that renders honest UTC. A signed-in member now picks their own in the
 * UserCP, and it arrives here as an argument.
 *
 * It stays an *argument* rather than something this module reads, for the same
 * reason `now` is: a formatter that resolved the viewer itself could not be
 * called from a cached region, and F10's guard would (correctly) reject it.
 *
 * ## Why `now` is a parameter
 *
 * "Today" is relative, so a formatter that reads the clock itself cannot be
 * tested without freezing time globally, and its output changes at midnight.
 * Passing `now` in makes every case here a pure function — and makes the
 * midnight boundary something a test can actually sit on.
 */

import type { TimeModel } from '@meith/theme-kit'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** The zone every timestamp used before F57, and the fallback for a guest. */
export const DEFAULT_TIMEZONE = 'UTC'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

interface CalendarParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/**
 * The calendar fields of an instant, in one zone.
 *
 * `Intl.DateTimeFormat` rather than arithmetic on an offset: an offset cannot
 * express summer time, so `+01:00` is an hour wrong for half the year in most
 * of Europe — and wrong in a way that reads as a broken timestamp rather than a
 * broken setting.
 *
 * A zone the runtime does not know **falls back to UTC** instead of throwing.
 * The value is validated before it is stored (F57), so reaching this needs a
 * row written against an older tz database; a page that 500s because a member's
 * saved zone was retired is worse than one that quietly shows UTC.
 */
function partsIn(date: Date, timeZone: string): CalendarParts {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
  } catch {
    return partsIn(date, DEFAULT_TIMEZONE)
  }

  const parts = new Map(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )

  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
    /* `24` is what en-GB emits for midnight with hour12: false. */
    hour: Number(parts.get('hour')) % 24,
    minute: Number(parts.get('minute')),
  }
}

function sameDay(a: CalendarParts, b: CalendarParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

/**
 * Format an instant the way a forum listing shows it.
 *
 * MyBB's shape, and it is the right one: recent activity is what a reader is
 * scanning for, so today and yesterday get a name and everything older gets a
 * date. A relative string ("3 hours ago") is deliberately *not* used — it is
 * wrong the moment the page is cached, and this page will be.
 */
export function formatTime(
  at: Date,
  now: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): TimeModel {
  const iso = at.toISOString()

  const when = partsIn(at, timeZone)
  const today = partsIn(now, timeZone)
  const time = `${pad(when.hour)}:${pad(when.minute)}`

  if (sameDay(when, today)) {
    return { iso, label: `Today, ${time}` }
  }

  /*
   * "Yesterday" is computed in the viewer's zone rather than by subtracting 24
   * hours from the instant: on a day when the clocks change, a fixed 24 hours
   * lands on the wrong calendar date and the label says "Yesterday" about
   * something two days old.
   */
  const yesterday = partsIn(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone)
  if (sameDay(when, yesterday)) {
    return { iso, label: `Yesterday, ${time}` }
  }

  const month = MONTHS[when.month - 1]

  /*
   * The year is dropped only for dates in the current year. A post from last
   * March showing "12 Mar" is genuinely ambiguous on a board that has been
   * running for years, and the ambiguity is invisible — it looks like a recent
   * post rather than a missing year.
   */
  if (when.year === today.year) {
    return { iso, label: `${when.day} ${month}, ${time}` }
  }

  return { iso, label: `${when.day} ${month} ${when.year}` }
}

/**
 * How a zone is named in the footer.
 *
 * The IANA id with its underscores removed reads better than the raw value
 * ("Europe/London", "America/New York") and stays unambiguous, which a bare
 * abbreviation like "CST" is not — that one means two different things
 * depending on the hemisphere.
 */
export function timezoneLabel(timeZone: string): string {
  return timeZone.replace(/_/g, ' ')
}
