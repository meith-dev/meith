import 'server-only'

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
