export interface CronSchedule {
  readonly minute: ReadonlySet<number>
  readonly hour: ReadonlySet<number>
  readonly dayOfMonth: ReadonlySet<number>
  readonly month: ReadonlySet<number>
  readonly dayOfWeek: ReadonlySet<number>
  readonly dayOfMonthRestricted: boolean
  readonly dayOfWeekRestricted: boolean
}

interface FieldBounds {
  readonly name: string
  readonly min: number
  readonly max: number
}

const MINUTE_MS = 60_000
const HORIZON_MS = 366 * 4 * 24 * 60 * MINUTE_MS

const MINUTE_BOUNDS: FieldBounds = { name: 'minute', min: 0, max: 59 }
const HOUR_BOUNDS: FieldBounds = { name: 'hour', min: 0, max: 23 }
const DAY_OF_MONTH_BOUNDS: FieldBounds = { name: 'day-of-month', min: 1, max: 31 }
const MONTH_BOUNDS: FieldBounds = { name: 'month', min: 1, max: 12 }
const DAY_OF_WEEK_BOUNDS: FieldBounds = { name: 'day-of-week', min: 0, max: 7 }

export function parseCron(expression: string): CronSchedule {
  const trimmed = expression.trim()
  if (trimmed === '') {
    throw new Error(
      'has an empty schedule; a schedule is five fields — minute hour day-of-month ' +
        'month day-of-week — evaluated in UTC',
    )
  }

  const fields = trimmed.split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(
      `has a ${fields.length}-field schedule "${trimmed}"; a schedule is exactly five fields ` +
        '(minute hour day-of-month month day-of-week), evaluated in UTC. The tick is ' +
        'minute-granular, so there is no seconds field — a sixth field would ask for a ' +
        'cadence faster than once a minute, which the scheduler cannot deliver',
    )
  }

  const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = fields as [
    string,
    string,
    string,
    string,
    string,
  ]

  return {
    minute: parseField(minuteField, MINUTE_BOUNDS),
    hour: parseField(hourField, HOUR_BOUNDS),
    dayOfMonth: parseField(dayOfMonthField, DAY_OF_MONTH_BOUNDS),
    month: parseField(monthField, MONTH_BOUNDS),
    dayOfWeek: normalizeDayOfWeek(parseField(dayOfWeekField, DAY_OF_WEEK_BOUNDS)),
    dayOfMonthRestricted: dayOfMonthField !== '*',
    dayOfWeekRestricted: dayOfWeekField !== '*',
  }
}

export function nextRun(schedule: CronSchedule, from: Date): Date {
  let time = Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS
  const horizon = time + HORIZON_MS

  while (time <= horizon) {
    const at = new Date(time)
    if (!matchesDay(schedule, at)) {
      time = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1)
      continue
    }
    if (schedule.hour.has(at.getUTCHours()) && schedule.minute.has(at.getUTCMinutes())) {
      return at
    }
    time += MINUTE_MS
  }

  throw new Error(
    `has no run time within four years of ${from.toISOString()}; is the schedule satisfiable?`,
  )
}

export function cronCadenceSeconds(schedule: CronSchedule, from: Date = new Date()): number {
  const first = nextRun(schedule, from)
  const second = nextRun(schedule, first)
  return Math.max(60, Math.round((second.getTime() - first.getTime()) / 1000))
}

function matchesDay(schedule: CronSchedule, at: Date): boolean {
  if (!schedule.month.has(at.getUTCMonth() + 1)) return false

  const dayOfMonthMatches = schedule.dayOfMonth.has(at.getUTCDate())
  const dayOfWeekMatches = schedule.dayOfWeek.has(at.getUTCDay())

  if (schedule.dayOfMonthRestricted && schedule.dayOfWeekRestricted) {
    return dayOfMonthMatches || dayOfWeekMatches
  }
  if (schedule.dayOfMonthRestricted) return dayOfMonthMatches
  if (schedule.dayOfWeekRestricted) return dayOfWeekMatches
  return true
}

function normalizeDayOfWeek(values: ReadonlySet<number>): ReadonlySet<number> {
  const normalized = new Set<number>()
  for (const value of values) normalized.add(value === 7 ? 0 : value)
  return normalized
}

function parseField(field: string, bounds: FieldBounds): ReadonlySet<number> {
  const values = new Set<number>()

  for (const term of field.split(',')) {
    if (term === '') {
      throw new Error(`has an empty ${bounds.name} term in "${field}"`)
    }

    let rangeText = term
    let step = 1
    const slash = term.indexOf('/')
    if (slash !== -1) {
      rangeText = term.slice(0, slash)
      step = readInteger(term.slice(slash + 1), bounds, term)
      if (step < 1) {
        throw new Error(`has a ${bounds.name} step "${term}" that is not a positive whole number`)
      }
    }

    let low: number
    let high: number
    if (rangeText === '*') {
      low = bounds.min
      high = bounds.max
    } else if (rangeText.includes('-')) {
      const [lowText, highText, ...rest] = rangeText.split('-')
      if (rest.length > 0 || lowText === undefined || highText === undefined) {
        throw new Error(`has a malformed ${bounds.name} range "${term}"`)
      }
      low = readInteger(lowText, bounds, term)
      high = readInteger(highText, bounds, term)
    } else {
      low = readInteger(rangeText, bounds, term)
      high = slash === -1 ? low : bounds.max
    }

    if (low < bounds.min || high > bounds.max || low > high) {
      throw new Error(
        `has a ${bounds.name} term "${term}" outside its range ${bounds.min}-${bounds.max}`,
      )
    }

    for (let value = low; value <= high; value += step) values.add(value)
  }

  return values
}

function readInteger(text: string, bounds: FieldBounds, term: string): number {
  if (!/^\d+$/.test(text)) {
    throw new Error(
      `has a ${bounds.name} term "${term}" that is not a whole number; schedules are numeric ` +
        '(no month or weekday names)',
    )
  }
  return Number(text)
}
