export const MAX_ATTEMPTS = 6

export const BASE_DELAY_SECONDS = 30

export const MAX_DELAY_SECONDS = 3600

export type Verdict = 'delivered' | 'retry' | 'dead'

export function nextDelaySeconds(attempt: number): number {
  const raw = BASE_DELAY_SECONDS * 2 ** Math.max(0, attempt - 1)
  return Math.min(raw, MAX_DELAY_SECONDS)
}

export function verdictFor(status: number | null, attempt: number): Verdict {
  if (status !== null && status >= 200 && status < 300) return 'delivered'

  const permanent =
    status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429

  if (permanent) return 'dead'
  return attempt >= MAX_ATTEMPTS ? 'dead' : 'retry'
}

export function describeFailure(status: number | null, detail: string): string {
  const head = status === null ? 'no response' : `HTTP ${status}`
  const tail = detail.trim().replace(/\s+/g, ' ').slice(0, 300)
  return tail === '' ? head : `${head}: ${tail}`
}
