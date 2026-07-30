/**
 * Timestamp formatting for view models (F25/F29).
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
 * (the footer says which). Until F57 gives each member a timezone setting, that
 * zone is **UTC** — chosen over the server's local zone because the server's zone
 * is an accident of where it is deployed, and a board that renders different
 * times after a region migration is worse than one that renders honest UTC.
 *
 * ## Why `now` is a parameter
 *
 * "Today" is relative, so a formatter that reads the clock itself cannot be
 * tested without freezing time globally, and its output changes at midnight.
 * Passing `now` in makes every case here a pure function — and makes the
 * midnight boundary something a test can actually sit on.
 */

import type { TimeModel } from '@forum/theme-kit'

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

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/** `HH:MM`, UTC. */
function clock(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

/** Whether two instants fall on the same UTC calendar day. */
function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/**
 * Format an instant the way a forum listing shows it.
 *
 * MyBB's shape, and it is the right one: recent activity is what a reader is
 * scanning for, so today and yesterday get a name and everything older gets a
 * date. A relative string ("3 hours ago") is deliberately *not* used — it is
 * wrong the moment the page is cached, and this page will be.
 */
export function formatTime(at: Date, now: Date): TimeModel {
  const iso = at.toISOString()

  if (sameUtcDay(at, now)) {
    return { iso, label: `Today, ${clock(at)}` }
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (sameUtcDay(at, yesterday)) {
    return { iso, label: `Yesterday, ${clock(at)}` }
  }

  const month = MONTHS[at.getUTCMonth()]
  const day = at.getUTCDate()

  /*
   * The year is dropped only for dates in the current year. A post from last
   * March showing "12 Mar" is genuinely ambiguous on a board that has been
   * running for years, and the ambiguity is invisible — it looks like a recent
   * post rather than a missing year.
   */
  if (at.getUTCFullYear() === now.getUTCFullYear()) {
    return { iso, label: `${day} ${month}, ${clock(at)}` }
  }

  return { iso, label: `${day} ${month} ${at.getUTCFullYear()}` }
}
