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

export const PAGE_PARAM = 'page'

const NEIGHBOURS = 2

export interface OffsetPagerInput {
  readonly path: string
  readonly params: QueryParams
  readonly pageParam?: string
  readonly page: number
  readonly pageSize: number
  readonly total: number
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

export function readPage(params: QueryParams, pageParam: string = PAGE_PARAM): number {
  const raw = one(params, pageParam)
  if (raw === undefined) return 1

  const page = Number(raw)
  return Number.isSafeInteger(page) && page >= 1 ? page : 1
}

export function offsetOf(page: number, pageSize: number): number {
  return (Math.max(page, 1) - 1) * pageSize
}

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(total, 0) / Math.max(pageSize, 1)))
}

function numberedHref(input: OffsetPagerInput, page: number): string {
  const pageParam = input.pageParam ?? PAGE_PARAM
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(input.params)) {
    if (key === pageParam || key === TRAIL_PARAM) continue
    const text = Array.isArray(value) ? value[0] : value
    if (text !== undefined && text !== '') query.set(key, text)
  }

  if (page > 1) query.set(pageParam, String(page))

  const search = query.toString()
  return search === '' ? input.path : `${input.path}?${search}`
}

export function buildOffsetPager(input: OffsetPagerInput): PaginationModel {
  const pageCount = pageCountOf(input.total, input.pageSize)
  const page = Math.max(input.page, 1)

  const anchor = Math.min(page, pageCount)

  const numbers = new Set<number>([1, pageCount])
  if (page <= pageCount) numbers.add(page)
  for (let step = 1; step <= NEIGHBOURS; step += 1) {
    if (anchor - step >= 1) numbers.add(anchor - step)
    if (anchor + step <= pageCount) numbers.add(anchor + step)
  }

  return {
    page,
    pageCount,
    pageCountIsExact: true,
    pages: [...numbers]
      .sort((a, b) => a - b)
      .map((number) => ({
        page: number,
        href: numberedHref(input, number),
        isCurrent: number === page,
      })),
    previousHref:
      page === 1 ? null : numberedHref(input, page > pageCount ? pageCount : page - 1),
    nextHref: page >= pageCount ? null : numberedHref(input, page + 1),
  }
}
