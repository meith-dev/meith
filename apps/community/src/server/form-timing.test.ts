import { describe, expect, it, vi } from 'vitest'

import { SettingsSnapshot } from '@meith/settings'

import { issueFormTiming, readFormTiming } from './form-timing'

vi.mock('./settings', () => ({
  getSettings: async () =>
    SettingsSnapshot.fromOverrides(new Map([['antispam.min_form_seconds', '3']])),
}))
vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'fixture' }) }))

const { verifyChallenge } = await import('./antispam')
const NOW = Date.now()

it('verifies only an unchanged signed timestamp within its lifetime', () => {
  const token = issueFormTiming(NOW)
  expect(readFormTiming(token, NOW + 3000)).toBe(NOW)
  expect(readFormTiming(token.replace(String(NOW), String(NOW - 5000)), NOW)).toBeNull()
  expect(readFormTiming(String(NOW - 5000), NOW)).toBeNull()
  expect(readFormTiming(token, NOW - 1)).toBeNull()
  expect(readFormTiming(token, NOW + 30 * 60 * 1000 + 1)).toBeNull()
  expect(readFormTiming(null, NOW)).toBeNull()
  expect(readFormTiming('0', NOW)).toBeNull()
})

describe('registration timing boundary', () => {
  it('rejects missing, zero and forged stamps', async () => {
    for (const token of ['', '0', String(NOW - 5000)]) {
      const form = new FormData()
      if (token !== '') form.set('_issued', token)
      expect(await verifyChallenge(form)).toMatchObject({ ok: false })
    }
  })

  it('allows a signed form after the delay and refuses an instant submission', async () => {
    const form = new FormData()
    form.set('_issued', issueFormTiming(Date.now() - 5000))
    expect(await verifyChallenge(form)).toEqual({ ok: true })
    form.set('_issued', issueFormTiming())
    expect(await verifyChallenge(form)).toMatchObject({ ok: false })
  })
})
