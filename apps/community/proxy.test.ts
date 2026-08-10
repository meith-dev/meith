import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PROTECTED_PREFIXES } from './proxy'

const here = path.dirname(fileURLToPath(import.meta.url))

function routeDirectories(prefix: string): readonly string[] {
  const segment = prefix.replace(/^\//, '')
  return [
    path.join(here, 'app', segment),
    path.join(here, 'app', '(board)', segment),
    path.join(here, 'app', '(auth)', segment),
  ]
}

describe('PROTECTED_PREFIXES', () => {
  it('names only routes that exist', () => {
    const missing = PROTECTED_PREFIXES.filter(
      (prefix) => !routeDirectories(prefix).some((dir) => existsSync(dir)),
    )

    expect(missing).toEqual([])
  })

  it('covers every member-facing panel a guest could be sent to sign in for', () => {
    expect([...PROTECTED_PREFIXES].sort()).toEqual([
      '/admin',
      '/messages',
      '/modcp',
      '/moderation',
      '/notifications',
      '/subscriptions',
      '/usercp',
    ])
  })

  it('has no prefix that is a prefix of another, which would be a dead entry', () => {
    for (const prefix of PROTECTED_PREFIXES) {
      const shadowed = PROTECTED_PREFIXES.filter(
        (other) => other !== prefix && prefix.startsWith(`${other}/`),
      )
      expect(shadowed).toEqual([])
    }
  })
})
