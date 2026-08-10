import { DEMO_LOGINS } from './accounts'

export interface DemoBannerLogin {
  readonly username: string
  readonly password: string
}

export interface DemoBanner {
  readonly logins: readonly DemoBannerLogin[]
  /** "in 34 minutes", or `null` before the first reset has been recorded. */
  readonly resetsIn: string | null
}

/**
 * What the banner says.
 *
 * Built here rather than in the app because it is the one piece of the demo a
 * visitor is guaranteed to read, and because the banner belongs to demo mode
 * rather than to the board: a visiting administrator can delete every
 * announcement on this board, and none of that touches the line telling the
 * next visitor how to log in.
 */
export function demoBanner(input: {
  readonly nextResetAt: Date | null
  readonly now: Date
}): DemoBanner {
  return {
    logins: Object.values(DEMO_LOGINS).map((login) => ({
      username: login.username,
      password: login.password,
    })),
    resetsIn: input.nextResetAt === null ? null : relative(input.nextResetAt, input.now),
  }
}

function relative(at: Date, now: Date): string {
  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000)

  if (minutes <= 0) return 'in a moment'
  if (minutes === 1) return 'in a minute'
  if (minutes < 60) return `in ${minutes} minutes`

  const hours = Math.round(minutes / 60)
  return hours === 1 ? 'in an hour' : `in ${hours} hours`
}
