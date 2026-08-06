import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const compose = await readFile(
  new URL('../../../docker-compose.coolify.yml', import.meta.url),
  'utf8',
)

function service(name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`)
  if (start === -1) throw new Error(`no ${name} service in the compose file`)
  const rest = compose.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}\S|\n\S/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

const SERVICES = ['postgres', 'migrate', 'web', 'worker']

describe('the Coolify compose file', () => {
  it('runs the whole board, not just the part that answers requests', () => {
    for (const name of SERVICES) {
      expect(() => service(name)).not.toThrow()
    }
  })

  it('asks the operator for nothing', () => {
    expect(service('web')).toContain('AUTH_SECRET=$SERVICE_BASE64_64_AUTH')
    expect(service('web')).toContain('TICK_SECRET=$SERVICE_BASE64_64_TICK')
    expect(compose).toContain('$SERVICE_PASSWORD_POSTGRES')
    expect(compose).not.toMatch(/AUTH_SECRET=\$\{[^}]*:-/)
    expect(compose).not.toMatch(/TICK_SECRET=\$\{[^}]*:-/)
  })

  it('tells the board its own URL, which mail links are absolute against', () => {
    expect(service('web')).toContain('SERVICE_FQDN_WEB_3000')
    expect(service('web')).toContain('APP_URL=$SERVICE_URL_WEB')
  })

  it('mounts the uploads volume into both processes that write to it', () => {
    for (const name of ['web', 'worker']) {
      expect(service(name)).toContain('uploads:/app/.uploads')
    }
    expect(compose).toMatch(/volumes:\n(.*\n)*\s{2}uploads:/)
  })

  it('runs the worker, which is the whole tick', () => {
    expect(service('worker')).toContain('FORUM_ROLE=worker')
    expect(service('worker')).toContain('CACHE_DRIVER=memory')
  })

  it('migrates before the web server serves anything', () => {
    expect(service('migrate')).toContain('FORUM_ROLE: migrate')
    expect(service('web')).toContain('condition: service_completed_successfully')
  })

  it('publishes no ports, leaving the proxy in front', () => {
    expect(compose).not.toMatch(/^\s*ports:/m)
  })

  it('keeps the queue in the database, where a restart cannot empty it', () => {
    expect(service('web')).toContain('QUEUE_DRIVER=postgres')
    expect(service('worker')).toContain('QUEUE_DRIVER=postgres')
  })

  it('generates the database password from an alphabet a URL can carry', () => {
    expect(compose).toMatch(/DATABASE_URL[=:] ?postgres:\/\/forum:\$SERVICE_PASSWORD_POSTGRES@/)
    expect(compose).not.toMatch(/postgres:\/\/forum:\$SERVICE_BASE64/)
  })
})
