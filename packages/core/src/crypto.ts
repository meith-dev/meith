import { timingSafeEqual } from 'node:crypto'

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')

  if (left.length !== right.length) {
    const padded = Buffer.alloc(Math.max(left.length, right.length))
    const other = Buffer.alloc(Math.max(left.length, right.length))
    left.copy(padded)
    right.copy(other)
    timingSafeEqual(padded, other)
    return false
  }

  return timingSafeEqual(left, right)
}
