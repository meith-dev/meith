import { createHash, randomBytes } from 'node:crypto'

import { env } from '@meith/core'

let salt: Buffer | undefined

export function demoDiscardsAddresses(): boolean {
  return env.DEMO_MODE
}

export function demoAddressToken(address: string): string {
  salt ??= randomBytes(32)
  return createHash('sha256').update(salt).update(address).digest('base64url').slice(0, 16)
}

export interface DemoIpPrefixes {
  readonly registration: string
  readonly lastVisit: string
}

const BENCHMARK_RANGE = 18

export function demoIpPrefixes(key: string): DemoIpPrefixes {
  const digest = createHash('sha256').update(key).digest()
  const prefix = (a: number, b: number): string =>
    `198.${BENCHMARK_RANGE + (digest[a]! % 2)}.${digest[b]!}.0/24`

  const registration = prefix(0, 1)

  return {
    registration,
    lastVisit: digest[2]! % 4 === 0 ? prefix(3, 4) : registration,
  }
}
