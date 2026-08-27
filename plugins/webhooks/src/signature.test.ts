import { describe, expect, it } from 'vitest'

import {
  deliveryHeaders,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  signPayload,
  TIMESTAMP_HEADER,
  verifySignature,
} from './signature'

const BODY = '{"event":"thread.created"}'

describe('signing a delivery', () => {
  it('verifies against the same secret, body and timestamp', () => {
    const signature = signPayload('shh', 1_700_000_000, BODY)
    expect(verifySignature('shh', 1_700_000_000, BODY, signature)).toBe(true)
  })

  it.each([
    ['a different secret', 'other', 1_700_000_000, BODY],
    ['a replayed timestamp', 'shh', 1_700_000_001, BODY],
    ['an edited body', 'shh', 1_700_000_000, '{"event":"post.created"}'],
  ])('refuses %s', (_case, secret, timestamp, body) => {
    const signature = signPayload('shh', 1_700_000_000, BODY)
    expect(verifySignature(secret, timestamp, body, signature)).toBe(false)
  })

  it('refuses a signature of the wrong length without comparing it', () => {
    expect(verifySignature('shh', 1_700_000_000, BODY, 'sha256=short')).toBe(false)
  })

  it('binds the timestamp into the signature, not merely alongside it', () => {
    expect(signPayload('shh', 1, BODY)).not.toBe(signPayload('shh', 2, BODY))
  })
})

describe('the headers a delivery carries', () => {
  it('names the event and signs the body when a secret is set', () => {
    const headers = deliveryHeaders({
      event: 'thread.created',
      body: BODY,
      secret: 'shh',
      timestampSeconds: 1_700_000_000,
    })

    expect(headers[EVENT_HEADER]).toBe('thread.created')
    expect(headers[TIMESTAMP_HEADER]).toBe('1700000000')
    expect(headers['content-type']).toBe('application/json')
    expect(verifySignature('shh', 1_700_000_000, BODY, headers[SIGNATURE_HEADER] as string)).toBe(
      true,
    )
  })

  it('sends no signature header at all when no secret is set, rather than an empty one', () => {
    const headers = deliveryHeaders({
      event: 'thread.created',
      body: BODY,
      secret: '',
      timestampSeconds: 1_700_000_000,
    })

    expect(headers).not.toHaveProperty(SIGNATURE_HEADER)
  })
})
