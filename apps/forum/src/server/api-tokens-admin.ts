import 'server-only'

/**
 * F81 — the token screen's read side.
 *
 * Until this existed a token could only be created with SQL, which meant the
 * documented way to use the board's own API was to hand somebody a psql prompt.
 * The screen is deliberately *administrative* rather than per-member: v1 tokens
 * are for a board's own integrations, and an operator who can already read
 * every table is not being given new reach by a list of them.
 *
 * **A token is never reconstructible from this page.** The store does not
 * select the secret hash, and the clear secret exists exactly once — in the
 * response that mints it. An operator who loses it revokes and issues again,
 * which is a minute's work and the only honest answer.
 */
import { SCOPES, isScope, issueToken, type Scope } from '@meith/api'
import { ValidationError } from '@meith/core'
import { PostgresApiTokenRepository, getDb, type ApiTokenSummary } from '@meith/db'

import { getContainer } from './container'

export function apiTokenStore(): PostgresApiTokenRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresApiTokenRepository(getDb(), isScope)
    : null
}

export interface ApiTokenRow {
  readonly id: number
  readonly name: string
  readonly username: string
  readonly lookup: string
  readonly scopes: readonly string[]
  readonly createdAt: Date
  readonly expiresAt: Date | null
  readonly lastUsedAt: Date | null
  /** Revoked, expired, or live — resolved here so the page renders a word. */
  readonly state: 'live' | 'revoked' | 'expired'
}

export interface ApiTokenView {
  readonly tokens: readonly ApiTokenRow[]
  readonly scopes: readonly string[]
}

export async function buildApiTokenView(now: Date): Promise<ApiTokenView | null> {
  const store = apiTokenStore()
  if (store === null) return null

  const rows = await store.listAll()
  return {
    tokens: rows.map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      lookup: row.lookup,
      scopes: row.scopes,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      state: tokenState(row, now),
    })),
    scopes: SCOPES,
  }
}

/**
 * Three states, not a boolean.
 *
 * "Revoked" and "expired" both mean the token no longer works and they are
 * completely different operationally: one was a decision, the other is a clock
 * running out on an integration that is about to start failing. Collapsing them
 * into "inactive" would hide the only one an operator can act on in advance.
 */
function tokenState(
  row: Pick<ApiTokenSummary, 'revokedAt' | 'expiresAt'>,
  now: Date,
): ApiTokenRow['state'] {
  if (row.revokedAt !== null) return 'revoked'
  if (row.expiresAt !== null && row.expiresAt <= now) return 'expired'
  return 'live'
}

export interface IssueTokenInput {
  readonly userId: number
  readonly name: string
  readonly scopes: readonly string[]
  readonly expiresAt: Date | null
}

/**
 * Mint a token and return the **only** copy of its secret.
 *
 * Validation before issue, so a rejected form never leaves a row behind. The
 * scope list is filtered against `SCOPES` rather than trusted: the form is a
 * public endpoint like any other, and a scope string that is not in the
 * registry would be stored and then silently never match anything.
 */
export async function issueApiToken(input: IssueTokenInput): Promise<string> {
  const store = apiTokenStore()
  if (store === null) throw new ValidationError('This board has no database, so it has no API.')

  const name = input.name.trim()
  if (name === '' || name.length > 80) {
    throw new ValidationError('Give the token a name of 1–80 characters.')
  }

  const scopes = input.scopes.filter((scope): scope is Scope => isScope(scope))
  if (scopes.length === 0) {
    throw new ValidationError('A token needs at least one scope, or it can do nothing.')
  }

  /*
   * `issueToken` hashes its own secret and never returns the clear one except
   * inside `token`. Nothing here re-derives it — the only value that leaves is
   * the one returned to the operator's screen.
   */
  const issued = issueToken()
  await store.create({
    userId: input.userId,
    name,
    lookup: issued.lookup,
    secretHash: issued.secretHash,
    scopes,
    expiresAt: input.expiresAt,
  })

  return issued.token
}
