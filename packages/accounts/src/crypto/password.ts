import { argon2id, argon2Verify } from 'hash-wasm'

import { isLegacyHash, verifyLegacyPassword } from './legacy'

export interface PasswordPolicy {
  readonly memorySize: number
  readonly iterations: number
  readonly parallelism: number
}

export const CURRENT_PASSWORD_POLICY: PasswordPolicy = {
  memorySize: 19456,
  iterations: 2,
  parallelism: 1,
}

const SALT_BYTES = 16
const HASH_BYTES = 32

export async function hashPassword(
  password: string,
  policy: PasswordPolicy = CURRENT_PASSWORD_POLICY,
): Promise<string> {
  if (password.length === 0) {
    throw new Error('Refusing to hash an empty password.')
  }
  const salt = randomBytes(SALT_BYTES)
  return argon2id({
    password,
    salt,
    memorySize: policy.memorySize,
    iterations: policy.iterations,
    parallelism: policy.parallelism,
    hashLength: HASH_BYTES,
    outputType: 'encoded',
  })
}

export async function verifyPassword(
  password: string,
  encodedHash: string | null | undefined,
): Promise<boolean> {
  if (!encodedHash) return false

  if (isLegacyHash(encodedHash)) return verifyLegacyPassword(password, encodedHash)

  try {
    return await argon2Verify({ password, hash: encodedHash })
  } catch {
    return false
  }
}

export interface Argon2Params {
  readonly algo: 'argon2id' | 'argon2i' | 'argon2d'
  readonly memorySize: number
  readonly iterations: number
  readonly parallelism: number
}

const PHC = /^\$(argon2id|argon2i|argon2d)\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/

export function parseArgon2Params(encodedHash: string): Argon2Params | null {
  const m = PHC.exec(encodedHash)
  if (!m) return null
  return {
    algo: m[1] as Argon2Params['algo'],
    memorySize: Number(m[2]),
    iterations: Number(m[3]),
    parallelism: Number(m[4]),
  }
}

export function needsRehash(
  encodedHash: string,
  policy: PasswordPolicy = CURRENT_PASSWORD_POLICY,
): boolean {
  const p = parseArgon2Params(encodedHash)
  if (p === null) return true
  if (p.algo !== 'argon2id') return true
  return (
    p.memorySize < policy.memorySize ||
    p.iterations < policy.iterations ||
    p.parallelism < policy.parallelism
  )
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}
