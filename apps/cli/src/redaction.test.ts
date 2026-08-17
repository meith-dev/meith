import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { looksLikeCredential, NOT_SECRET_DESPITE_THE_NAME, SECRET_ENV_KEYS } from './redaction'

const ENV_SCHEMA = fileURLToPath(new URL('../../../packages/core/src/env.ts', import.meta.url))

function declaredEnvKeys(): readonly string[] {
  const source = readFileSync(ENV_SCHEMA, 'utf8')
  const keys = [...source.matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]!)

  expect(keys.length).toBeGreaterThan(20)
  return [...new Set(keys)]
}

describe('forum env never prints a credential', () => {
  it('redacts, or explicitly excuses, every credential-shaped variable', () => {
    const unhandled = declaredEnvKeys().filter(
      (key) =>
        looksLikeCredential(key) &&
        !SECRET_ENV_KEYS.has(key) &&
        !NOT_SECRET_DESPITE_THE_NAME.has(key),
    )

    expect(
      unhandled,
      `These environment variables read like credentials but are neither redacted ` +
        `nor excused in apps/cli/src/redaction.ts, so "forum env" prints them in ` +
        `full: ${unhandled.join(', ')}`,
    ).toEqual([])
  })

  it('redacts the mail password that started this', () => {
    expect(SECRET_ENV_KEYS.has('MAIL_SMTP_PASSWORD')).toBe(true)
    expect(SECRET_ENV_KEYS.has('MAIL_HTTP_TOKEN')).toBe(true)
  })

  it('does not redact anything the schema no longer declares', () => {
    const declared = new Set(declaredEnvKeys())
    const stale = [...SECRET_ENV_KEYS, ...NOT_SECRET_DESPITE_THE_NAME].filter(
      (key) => !declared.has(key),
    )

    expect(stale, `no longer in the schema: ${stale.join(', ')}`).toEqual([])
  })

  it('still matches the names it is meant to catch', () => {
    expect(looksLikeCredential('MAIL_SMTP_PASSWORD')).toBe(true)
    expect(looksLikeCredential('AUTH_SECRET')).toBe(true)
    expect(looksLikeCredential('MAIL_HTTP_TOKEN')).toBe(true)
    expect(looksLikeCredential('S3_SECRET_ACCESS_KEY')).toBe(true)
    expect(looksLikeCredential('DATABASE_URL')).toBe(true)

    expect(looksLikeCredential('MAIL_SMTP_HOST')).toBe(false)
    expect(looksLikeCredential('LOG_LEVEL')).toBe(false)
    expect(looksLikeCredential('TICK_MAX_JOBS')).toBe(false)
  })
})
