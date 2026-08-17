import { createHash } from 'node:crypto'

import type { DayKey } from './day'

export const VISITOR_KEY_LENGTH = 32

export interface VisitorIdentity {
  readonly subject: string
  readonly member: boolean
}

export function visitorIdentity(input: {
  readonly userId: number | null
  readonly guestToken: string | null
}): VisitorIdentity | null {
  if (input.userId !== null) {
    return { subject: `u:${input.userId}`, member: true }
  }

  const token = (input.guestToken ?? '').trim()
  if (token === '') return null

  return { subject: `g:${token}`, member: false }
}

const SEPARATOR = '\u001f'

function digest(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join(SEPARATOR)).digest('hex')
}

export function visitorKey(input: {
  readonly subject: string
  readonly day: DayKey
  readonly salt: string
}): string {
  return digest([input.salt, input.day, input.subject]).slice(0, VISITOR_KEY_LENGTH)
}

export function connectorClientId(input: {
  readonly subject: string
  readonly salt: string
}): string {
  const hex = digest([input.salt, 'connector', input.subject])
  const left = Number.parseInt(hex.slice(0, 10), 16) % 10_000_000_000
  const right = Number.parseInt(hex.slice(10, 20), 16) % 10_000_000_000

  return `${left}.${right}`
}
