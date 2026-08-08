/**
 * The test that would have caught the leak.
 *
 * `community env` redacts a **deny-list**, and a deny-list is only as good as the
 * discipline of whoever last touched the schema. `MAIL_SMTP_PASSWORD` was added
 * to `env.ts` and not to the list, so the command that exists to be pasted into
 * bug reports would have pasted a mail password. Nothing failed; it was noticed
 * by reading the file for an unrelated reason.
 *
 * So the invariant is enforced on the *shape* rather than on the contents:
 * every variable the schema declares whose name reads like a credential must be
 * either redacted or explicitly excused. Adding `S3_SESSION_TOKEN` tomorrow and
 * forgetting the list fails here, by name.
 *
 * ## It reads the schema as text, deliberately
 *
 * The alternative is to enumerate keys from a parsed `Env`, and that cannot
 * work: every variable this test cares about is `.optional()`, so an unset one
 * is simply absent from the object and the test would pass by seeing nothing.
 * The declarations are the complete list, and they only exist in the source.
 * `scripts/guards.mjs` reads the tree the same way for the same reason — a
 * textual invariant needs the text.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  NOT_SECRET_DESPITE_THE_NAME,
  SECRET_ENV_KEYS,
  looksLikeCredential,
} from './redaction'

const ENV_SCHEMA = fileURLToPath(
  new URL('../../../packages/core/src/env.ts', import.meta.url),
)

/**
 * Every variable name the schema declares.
 *
 * Anchored on the four-space indentation of a property inside the `z.object`,
 * which is what every declaration in that file looks like and what nothing else
 * in it looks like.
 */
function declaredEnvKeys(): readonly string[] {
  const source = readFileSync(ENV_SCHEMA, 'utf8')
  const keys = [...source.matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]!)

  /* If the file is ever reformatted this finds nothing and passes vacuously. */
  expect(keys.length).toBeGreaterThan(20)
  return [...new Set(keys)]
}

describe('community env never prints a credential', () => {
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
        `nor excused in apps/cli/src/redaction.ts, so "community env" prints them in ` +
        `full: ${unhandled.join(', ')}`,
    ).toEqual([])
  })

  it('redacts the mail password that started this', () => {
    /* The specific regression. Kills a mutant that empties the set entirely. */
    expect(SECRET_ENV_KEYS.has('MAIL_SMTP_PASSWORD')).toBe(true)
    expect(SECRET_ENV_KEYS.has('MAIL_HTTP_TOKEN')).toBe(true)
  })

  it('does not redact anything the schema no longer declares', () => {
    /*
     * The other direction, and the reason it is worth asserting: a redacted name
     * that no longer exists is a list nobody is maintaining, and the next person
     * to read it cannot tell which entries are load-bearing.
     */
    const declared = new Set(declaredEnvKeys())
    const stale = [...SECRET_ENV_KEYS, ...NOT_SECRET_DESPITE_THE_NAME].filter(
      (key) => !declared.has(key),
    )

    expect(stale, `no longer in the schema: ${stale.join(', ')}`).toEqual([])
  })

  it('still matches the names it is meant to catch', () => {
    /* A pattern loosened until it matches nothing would pass every test above. */
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
