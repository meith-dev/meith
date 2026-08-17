import { describe, expect, it } from 'vitest'

import { signStripePayload, verifyStripeSignature } from './webhook'

const SECRET = 'whsec_test_secret_for_the_suite'
const NOW = new Date('2026-08-10T12:00:00Z')
const ts = Math.floor(NOW.getTime() / 1000)
const body = (text: string) => new TextEncoder().encode(text)

describe('verifyStripeSignature', () => {
  it('accepts what signStripePayload produced, over the exact bytes', () => {
    const raw = body('{"id":"evt_1","type":"invoice.paid"}')
    const header = signStripePayload(raw, SECRET, ts)

    expect(verifyStripeSignature(raw, header, SECRET, NOW)).toEqual({ ok: true, timestamp: ts })
  })

  it('rejects a tampered body and a wrong secret', () => {
    const raw = body('{"amount":500}')
    const header = signStripePayload(raw, SECRET, ts)

    expect(verifyStripeSignature(body('{"amount":9999}'), header, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(verifyStripeSignature(raw, header, 'whsec_other', NOW)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('rejects outside the replay tolerance, either direction', () => {
    const raw = body('{}')
    const past = signStripePayload(raw, SECRET, ts - 301)
    const future = signStripePayload(raw, SECRET, ts + 301)

    expect(verifyStripeSignature(raw, past, SECRET, NOW)).toEqual({ ok: false, reason: 'stale' })
    expect(verifyStripeSignature(raw, future, SECRET, NOW)).toEqual({ ok: false, reason: 'stale' })
    expect(
      verifyStripeSignature(raw, signStripePayload(raw, SECRET, ts - 299), SECRET, NOW).ok,
    ).toBe(true)
  })

  it('accepts any one of several v1 values — the secret-rotation shape', () => {
    const raw = body('{"id":"evt_2"}')
    const good = signStripePayload(raw, SECRET, ts).split(',')[1]
    const header = `t=${ts},v1=${'0'.repeat(64)},${good}`

    expect(verifyStripeSignature(raw, header, SECRET, NOW).ok).toBe(true)
  })

  it.each([
    [null, 'missing'],
    ['', 'missing'],
    ['v1=abc', 'malformed'],
    [`t=${'x'.repeat(4)},v1=${'0'.repeat(64)}`, 'malformed'],
    [`t=1754827200,v1=nothex`, 'malformed'],
  ])('rejects the header %o as %s', (header, reason) => {
    expect(verifyStripeSignature(body('{}'), header, SECRET, NOW)).toEqual({
      ok: false,
      reason,
    })
  })

  it('never accepts a signature of the re-serialised JSON', () => {
    const original = body('{"a": 1}')
    const reserialised = body('{"a":1}')
    const header = signStripePayload(original, SECRET, ts)

    expect(verifyStripeSignature(reserialised, header, SECRET, NOW).ok).toBe(false)
  })
})
