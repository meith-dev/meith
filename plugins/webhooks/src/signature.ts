import { createHmac, timingSafeEqual } from 'node:crypto'

export const SIGNATURE_HEADER = 'x-meith-signature'
export const TIMESTAMP_HEADER = 'x-meith-timestamp'
export const EVENT_HEADER = 'x-meith-event'

export function signPayload(secret: string, timestampSeconds: number, body: string): string {
  const mac = createHmac('sha256', secret)
  mac.update(`${timestampSeconds}.${body}`, 'utf8')
  return `sha256=${mac.digest('hex')}`
}

export function verifySignature(
  secret: string,
  timestampSeconds: number,
  body: string,
  presented: string,
): boolean {
  const expected = Buffer.from(signPayload(secret, timestampSeconds, body), 'utf8')
  const actual = Buffer.from(presented, 'utf8')
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

export function deliveryHeaders(input: {
  readonly event: string
  readonly body: string
  readonly secret: string
  readonly timestampSeconds: number
}): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [EVENT_HEADER]: input.event,
    [TIMESTAMP_HEADER]: String(input.timestampSeconds),
  }

  if (input.secret !== '') {
    headers[SIGNATURE_HEADER] = signPayload(input.secret, input.timestampSeconds, input.body)
  }

  return headers
}
