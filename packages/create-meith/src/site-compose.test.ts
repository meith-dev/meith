import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const ROOT = new URL('../../../', import.meta.url)

const compose = await readFile(new URL('docker-compose.site.coolify.yml', ROOT), 'utf8')
const dockerfile = await readFile(new URL('docker/Dockerfile.site', ROOT), 'utf8')
const nextConfig = await readFile(new URL('apps/web/next.config.mjs', ROOT), 'utf8')

describe('the site Coolify compose file', () => {
  it('deploys meith.dev and nothing the board owns', () => {
    expect(compose).toMatch(/^\s{2}site:/m)
    expect(compose).toContain('dockerfile: docker/Dockerfile.site')
    expect(compose).not.toMatch(/^\s*postgres:/m)
    expect(compose).not.toMatch(/^\s*volumes:/m)
    expect(compose).not.toContain('DATABASE_URL')
    expect(compose).not.toContain('AUTH_SECRET')
  })

  it('asks Coolify for a domain on the port the image listens on', () => {
    expect(compose).toContain('SERVICE_FQDN_SITE_3100')
    expect(dockerfile).toContain('ENV PORT=3100')
  })

  it('publishes no ports, leaving the proxy in front', () => {
    expect(compose).not.toMatch(/^\s*ports:/m)
  })
})

describe('the site image', () => {
  it('builds the standalone output the runtime stage copies', () => {
    expect(dockerfile).toContain('ENV SITE_STANDALONE=1')
    expect(nextConfig).toContain('process.env.SITE_STANDALONE === "1"')
    expect(dockerfile).toContain('/repo/apps/web/.next/standalone')
  })

  it('carries the workspace marker and docs/ the doc routes read at runtime', () => {
    expect(dockerfile).toContain('./pnpm-workspace.yaml')
    expect(dockerfile).toMatch(/\/repo\/docs \.\/docs/)
  })
})
