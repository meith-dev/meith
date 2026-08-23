/**
 * The one place this package touches the network — and only ever server-side:
 * the daily task and the admin "Refresh" action both call `refreshCatalog`
 * (see refresh.ts), never the browser. Node's built-in `fetch` is enough; no
 * HTTP client dependency is added for this.
 */
export interface FetchFeedResult {
  readonly ok: boolean
  /** Parsed JSON body, present only when `ok` is true. */
  readonly body: unknown
  /** A short, loggable reason, present only when `ok` is false. */
  readonly error: string | null
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 2_000_000

export interface FetchFeedOptions {
  readonly url: string
  readonly timeoutMs?: number
  /** Swappable for tests; defaults to the platform's global `fetch`. */
  readonly fetchImpl?: typeof fetch
}

/**
 * Fetches and JSON-parses a marketplace feed. Never throws: an unreachable
 * host, a non-200 response, an oversized body or invalid JSON are all
 * reported as `{ ok: false, error }` — the board with no outbound network is
 * meant to fail quietly here, not crash the task that called this.
 */
export async function fetchMarketplaceFeed(options: FetchFeedOptions): Promise<FetchFeedResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetchImpl(options.url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })
    } catch (error) {
      return { ok: false, body: null, error: `could not reach ${options.url}: ${String(error)}` }
    }

    if (!response.ok) {
      return { ok: false, body: null, error: `${options.url} answered ${response.status}` }
    }

    const text = await response.text()
    if (text.length > MAX_BODY_BYTES) {
      return {
        ok: false,
        body: null,
        error: `${options.url} answered a body over ${MAX_BODY_BYTES} bytes`,
      }
    }

    try {
      return { ok: true, body: JSON.parse(text), error: null }
    } catch {
      return { ok: false, body: null, error: `${options.url} did not answer valid JSON` }
    }
  } finally {
    clearTimeout(timeout)
  }
}
