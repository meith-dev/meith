import { InternalError } from '@meith/core'

import type { Fetcher } from './types'

const TIMEOUT_MS = 10_000

export async function fetchJson(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  what: string,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (cause) {
    throw new InternalError(`Could not reach the identity provider to ${what}.`, {
      cause,
    })
  }

  if (!response.ok) {
    throw new InternalError(
      `The identity provider refused to ${what} (HTTP ${response.status}).`,
    )
  }

  try {
    return (await response.json()) as unknown
  } catch (cause) {
    throw new InternalError(
      `The identity provider answered with something that is not JSON when asked to ${what}.`,
      { cause },
    )
  }
}

export function readString(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) return null
  const value = (source as Record<string, unknown>)[key]
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function readBoolean(source: unknown, key: string): boolean {
  if (typeof source !== 'object' || source === null) return false
  const value = (source as Record<string, unknown>)[key]
  return value === true || value === 'true'
}
