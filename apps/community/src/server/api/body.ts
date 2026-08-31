import 'server-only'

export const MAX_API_BODY_BYTES = 256 * 1024

export type JsonBodyOutcome =
  | { readonly kind: 'ok'; readonly body: Record<string, unknown> | null }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'invalid' }

async function readBounded(
  request: Request,
  limit: number,
): Promise<Uint8Array | 'too-large' | 'unreadable'> {
  const stream = request.body
  if (stream === null) {
    try {
      const whole = new Uint8Array(await request.arrayBuffer())
      return whole.byteLength > limit ? 'too-large' : whole
    } catch {
      return 'unreadable'
    }
  }

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    let step = await reader.read()
    while (!step.done) {
      const chunk = step.value
      if (chunk !== undefined) {
        total += chunk.byteLength
        if (total > limit) {
          await reader.cancel().catch(() => {})
          return 'too-large'
        }
        chunks.push(chunk)
      }
      step = await reader.read()
    }
  } catch {
    return 'unreadable'
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function readJsonBody(
  request: Request,
  limit: number = MAX_API_BODY_BYTES,
): Promise<JsonBodyOutcome> {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > limit) return { kind: 'too-large' }

  const bytes = await readBounded(request, limit)
  if (bytes === 'too-large') return { kind: 'too-large' }
  if (bytes === 'unreadable') return { kind: 'invalid' }
  if (bytes.byteLength === 0) return { kind: 'ok', body: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return { kind: 'invalid' }
  }

  return {
    kind: 'ok',
    body:
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null,
  }
}
