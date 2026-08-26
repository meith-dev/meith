import { DEMO_LOGINS } from './accounts'

export interface DemoBannerLogin {
  readonly username: string
  readonly password: string
}

export interface DemoBanner {
  readonly logins: readonly DemoBannerLogin[]
  readonly resetsIn: string | null
}

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
