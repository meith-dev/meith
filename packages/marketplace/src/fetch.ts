export interface FetchFeedResult {
  readonly ok: boolean
  readonly body: unknown
  readonly error: string | null
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 2_000_000

export interface FetchFeedOptions {
  readonly url: string
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
}

export async function readCappedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const declared = Number(declaredLength)
    if (Number.isFinite(declared) && declared > maxBytes) return null
  }

  if (response.body === null) {
    const buffer = await response.arrayBuffer()
    return buffer.byteLength > maxBytes ? null : new Uint8Array(buffer)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return combined
}

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
        redirect: 'manual',
      })
    } catch (error) {
      return { ok: false, body: null, error: `could not reach ${options.url}: ${String(error)}` }
    }

    if (!response.ok) {
      return { ok: false, body: null, error: `${options.url} answered ${response.status}` }
    }

    const bytes = await readCappedBody(response, MAX_BODY_BYTES)
    if (bytes === null) {
      return {
        ok: false,
        body: null,
        error: `${options.url} answered a body over ${MAX_BODY_BYTES} bytes`,
      }
    }

    try {
      return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)), error: null }
    } catch {
      return { ok: false, body: null, error: `${options.url} did not answer valid JSON` }
    }
  } finally {
    clearTimeout(timeout)
  }
}
