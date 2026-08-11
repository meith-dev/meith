import { randomBytes } from 'node:crypto'

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_SHAPE = /^[A-Z0-9][A-Z0-9-]{2,31}$/

export function generateCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let index = 0; index < 8; index += 1) {
    if (index === 4) out += '-'
    out += CODE_ALPHABET[bytes[index]! % CODE_ALPHABET.length]
  }
  return out
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase()
}

export function validCodeShape(code: string): boolean {
  return CODE_SHAPE.test(code)
}

export function discountedPrice(priceMinor: number, percentOff: number): number {
  return Math.max(0, Math.round((priceMinor * (100 - percentOff)) / 100))
}

export interface UsableCode {
  readonly percentOff: number
  readonly planKey: string | null
  readonly maxRedemptions: number | null
  readonly redeemedCount: number
  readonly expiresAt: Date | null
  readonly disabled: boolean
}

export type CodeProblem = 'disabled' | 'expired' | 'exhausted' | 'wrong-plan'

export function codeProblem(code: UsableCode, planKey: string, now: Date): CodeProblem | null {
  if (code.disabled) return 'disabled'
  if (code.expiresAt !== null && code.expiresAt <= now) return 'expired'
  if (code.maxRedemptions !== null && code.redeemedCount >= code.maxRedemptions) {
    return 'exhausted'
  }
  if (code.planKey !== null && code.planKey !== planKey) return 'wrong-plan'
  return null
}
