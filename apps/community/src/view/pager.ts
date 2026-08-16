import type { PaginationModel } from '@meith/theme-kit'

export const TRAIL_PARAM = 'seen'

export const TRAIL_LIMIT = 40

const TRAIL_SEPARATOR = '~'

const WINDOW = 3

export type QueryParams = Readonly<Record<string, string | string[] | undefined>>

export type Cursor = Readonly<Record<string, string>>

export interface PagerInput {
  readonly path: string
  readonly params: QueryParams
  /**
   * The query parameters the cursor owns. They are rewritten on every step and
   * never carried forward from the current address, which is what keeps a
   * two-part cursor — a rank and an id — from being half of one page and half
   * of the next.
   */
  readonly cursorParams: readonly string[]
  readonly nextCursor: Cursor | null
  readonly pageSize?: number
  readonly total?: number | null
}

export function one(params: QueryParams, key: string): string | undefined {
  const raw = params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === '' ? undefined : value
}

function encodeCursor(cursor: Cursor): string {
  return new URLSearchParams(Object.entries(cursor)).toString()
}

function decodeCursor(entry: string): Cursor {
  return Object.fromEntries(new URLSearchParams(entry))
}

export function readTrail(params: QueryParams): Cursor[] {
  const raw = one(params, TRAIL_PARAM)
  if (raw === undefined) return []

  return raw
    .split(TRAIL_SEPARATOR)
    .filter((entry) => entry !== '')
    .slice(-TRAIL_LIMIT)
    .map(decodeCursor)
}

function href(input: PagerInput, cursor: Cursor | null, trail: readonly Cursor[]): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(input.params)) {
    if (key === TRAIL_PARAM || input.cursorParams.includes(key)) continue
    const text = Array.isArray(value) ? value[0] : value
    if (text !== undefined && text !== '') query.set(key, text)
  }

  if (cursor !== null) {
    for (const [key, value] of Object.entries(cursor)) query.set(key, value)
  }

  if (trail.length > 0) {
    query.set(TRAIL_PARAM, trail.map(encodeCursor).join(TRAIL_SEPARATOR))
  }

  const search = query.toString()
  return search === '' ? input.path : `${input.path}?${search}`
}

function pageHref(input: PagerInput, trail: readonly Cursor[], page: number): string {
  if (page <= 1) return href(input, null, [])
  return href(input, trail[page - 2] ?? null, trail.slice(0, page - 1))
}

export function buildPager(input: PagerInput): PaginationModel {
  const trail = readTrail(input.params)
  const page = trail.length + 1

  const size = input.pageSize ?? 0
  const total = input.total ?? null
  const exact = total !== null && size > 0

  const pageCount = exact
    ? Math.max(1, Math.ceil(total / size))
    : page + (input.nextCursor === null ? 0 : 1)

  const numbers = new Set<number>([1, page])
  for (let step = 1; step <= WINDOW; step += 1) {
    if (page - step > 1) numbers.add(page - step)
  }

  const pages = [...numbers]
    .sort((a, b) => a - b)
    .map((number) => ({
      page: number,
      href: pageHref(input, trail, number),
      isCurrent: number === page,
    }))

  return {
    page,
    pageCount,
    pageCountIsExact: exact,
    pages,
    previousHref: page === 1 ? null : pageHref(input, trail, page - 1),
    nextHref:
      input.nextCursor === null
        ? null
        : href(input, input.nextCursor, [...trail, input.nextCursor].slice(-TRAIL_LIMIT)),
  }
}
