import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { contentSecurityPolicy } from '../apps/community/src/server/content-security-policy'
import { ROOT, repoFiles } from '../scripts/repo-files.mjs'

const BOARD = 'apps/community'

const ALLOWED_RUNTIME_DEPENDENCIES = /^(@meith\/|next$|react$|react-dom$)/

const BOARD_SOURCE = /^apps\/community\/(app|src)\/.*\.tsx?$/

const NOT_SOURCE = /\.test\.tsx?$/

const SCRIPT_ELEMENT = /<script\b[^>]*>/gi

async function boardManifest(): Promise<{
  dependencies?: Record<string, string>
}> {
  return JSON.parse(
    await readFile(join(ROOT, BOARD, 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> }
}

describe('what the board sends a browser', () => {
  it('depends on this workspace, Next and React, and nothing else at runtime', async () => {
    const dependencies = Object.keys((await boardManifest()).dependencies ?? {})

    expect(
      dependencies.filter((name) => !ALLOWED_RUNTIME_DEPENDENCIES.test(name)),
    ).toEqual([])
  })

  it('renders no script element that loads from another host', async () => {
    const offending: string[] = []

    for (const { abs, rel } of await repoFiles()) {
      if (!BOARD_SOURCE.test(rel) || NOT_SOURCE.test(rel)) continue

      const source = await readFile(abs, 'utf8')
      for (const element of source.matchAll(SCRIPT_ELEMENT)) {
        if (/src\s*=/i.test(element[0])) offending.push(`${rel}: ${element[0]}`)
      }
    }

    expect(offending).toEqual([])
  })

  it('names no analytics vendor anywhere in the board', async () => {
    const vendors =
      /@vercel\/analytics|googletagmanager|google-analytics|plausible\.io|hotjar|clarity\.ms|segment\.com/i
    const offending: string[] = []

    for (const { abs, rel } of await repoFiles()) {
      if (!rel.startsWith(`${BOARD}/`)) continue
      if (!/\.(ts|tsx|json|mjs)$/.test(rel) || NOT_SOURCE.test(rel)) continue

      if (vendors.test(await readFile(abs, 'utf8'))) offending.push(rel)
    }

    expect(offending).toEqual([])
  })

  it('serves a policy that allows scripts from this board alone', () => {
    const policy = contentSecurityPolicy({ nonce: 'abc', remoteImages: true })

    const directives = new Map(
      policy.split(';').map((part) => {
        const [name, ...rest] = part.trim().split(/\s+/)
        return [name, rest] as const
      }),
    )

    for (const directive of ['script-src', 'connect-src', 'default-src', 'form-action']) {
      const sources = directives.get(directive) ?? []
      expect(
        sources.filter((source) => /^https?:\/\//.test(source)),
        `${directive} in ${policy}`,
      ).toEqual([])
    }
  })
})
