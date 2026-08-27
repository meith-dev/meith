import { describe, expect, it } from 'vitest'

import {
  BASE_DELAY_SECONDS,
  describeFailure,
  MAX_ATTEMPTS,
  MAX_DELAY_SECONDS,
  nextDelaySeconds,
  verdictFor,
} from './delivery'

describe('the retry schedule', () => {
  it('backs off exponentially from the first failure', () => {
    expect(nextDelaySeconds(1)).toBe(BASE_DELAY_SECONDS)
    expect(nextDelaySeconds(2)).toBe(BASE_DELAY_SECONDS * 2)
    expect(nextDelaySeconds(3)).toBe(BASE_DELAY_SECONDS * 4)
  })

  it('caps, so a long-dead endpoint is retried hourly rather than yearly', () => {
    expect(nextDelaySeconds(50)).toBe(MAX_DELAY_SECONDS)
  })
})

describe('what to do with a response', () => {
  it.each([200, 201, 204, 299])('treats %i as delivered', (status) => {
    expect(verdictFor(status, 1)).toBe('delivered')
  })

  it.each([400, 401, 403, 404, 410])(
    'gives up immediately on %i — retrying cannot help',
    (status) => {
      expect(verdictFor(status, 1)).toBe('dead')
    },
  )

  it.each([408, 429, 500, 503])('retries %i', (status) => {
    expect(verdictFor(status, 1)).toBe('retry')
  })

  it('retries a request that never got a response at all', () => {
    expect(verdictFor(null, 1)).toBe('retry')
  })

  it('stops retrying once the attempt budget is spent', () => {
    expect(verdictFor(500, MAX_ATTEMPTS - 1)).toBe('retry')
    expect(verdictFor(500, MAX_ATTEMPTS)).toBe('dead')
    expect(verdictFor(null, MAX_ATTEMPTS)).toBe('dead')
  })
})

describe('the recorded failure', () => {
  it('names the status and what the endpoint said', () => {
    expect(describeFailure(500, 'upstream exploded')).toBe('HTTP 500: upstream exploded')
  })

  it('says so plainly when there was no response', () => {
    expect(describeFailure(null, 'fetch failed')).toBe('no response: fetch failed')
    expect(describeFailure(null, '   ')).toBe('no response')
  })

  it('collapses and truncates a body that is a whole HTML page', () => {
    const recorded = describeFailure(502, `<html>\n  ${'x'.repeat(500)}\n</html>`)
    expect(recorded.length).toBeLessThanOrEqual(310)
    expect(recorded).not.toContain('\n')
  })
})
