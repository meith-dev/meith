/**
 * `docker-compose.coolify.yml` is the guided shape of the one deployment route,
 * and its promise is narrow enough to check: bring a machine, point Coolify at
 * this repository, type nothing.
 *
 * Each assertion below is one clause of that promise, and each is a way the file
 * could be edited into something that still starts and is quietly wrong — a
 * secret with a literal default, a worker that never runs, an uploads volume
 * mounted into only one of the two processes that write to it. None of those
 * fail at deploy time. They fail later, as a board whose sessions are forgeable,
 * whose queued mail never leaves, or whose avatars 404 half the time.
 *
 * Read with a deliberately small parser rather than a YAML dependency: the shape
 * it reads is the shape this repository writes.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const compose = await readFile(
  new URL('../../../docker-compose.coolify.yml', import.meta.url),
  'utf8',
)

/** The lines belonging to one top-level service block. */
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

  /*
   * The point of this file over the ordinary compose file. Coolify fills these
   * in on the first deploy and keeps them; a literal default here would be a
   * board every reader of this repository can sign a session for.
   */
  it('asks the operator for nothing', () => {
    expect(service('web')).toContain('AUTH_SECRET=$SERVICE_BASE64_64_AUTH')
    expect(service('web')).toContain('TICK_SECRET=$SERVICE_BASE64_64_TICK')
    expect(compose).toContain('$SERVICE_PASSWORD_POSTGRES')
    /* No `:-` fallbacks on the secrets, which would supply a shipped default. */
    expect(compose).not.toMatch(/AUTH_SECRET=\$\{[^}]*:-/)
    expect(compose).not.toMatch(/TICK_SECRET=\$\{[^}]*:-/)
  })

  it('tells the board its own URL, which mail links are absolute against', () => {
    expect(service('web')).toContain('SERVICE_FQDN_WEB_3000')
    expect(service('web')).toContain('APP_URL=$SERVICE_URL_WEB')
  })

  /*
   * Both processes write uploads — the web server when somebody sets an avatar,
   * the worker when a queued job re-encodes one — so a volume in only one of
   * them is an avatar that exists for half the board.
   */
  it('mounts the uploads volume into both processes that write to it', () => {
    for (const name of ['web', 'worker']) {
      expect(service(name)).toContain('uploads:/app/.uploads')
    }
    expect(compose).toMatch(/volumes:\n(.*\n)*\s{2}uploads:/)
  })

  it('runs the worker, which is the whole tick', () => {
    expect(service('worker')).toContain('COMMUNITY_ROLE=worker')
    /*
     * Not `next`: the worker is a plain Node process, so a cache backed by a
     * framework that is not running would be a cache of nothing.
     */
    expect(service('worker')).toContain('CACHE_DRIVER=memory')
  })

  it('migrates before the web server serves anything', () => {
    expect(service('migrate')).toContain('COMMUNITY_ROLE: migrate')
    expect(service('web')).toContain('condition: service_completed_successfully')
  })

  /*
   * Coolify's proxy terminates TLS and routes to the container. A published
   * port would put the board on the host as well, reachable around the proxy
   * and without the certificate.
   */
  it('publishes no ports, leaving the proxy in front', () => {
    expect(compose).not.toMatch(/^\s*ports:/m)
  })

  it('keeps the queue in the database, where a restart cannot empty it', () => {
    expect(service('web')).toContain('QUEUE_DRIVER=postgres')
    expect(service('worker')).toContain('QUEUE_DRIVER=postgres')
  })

  /*
   * The database password is substituted into a `postgres://` URL, and the
   * ordinary compose file's equivalent produced `TypeError: Invalid URL` for
   * about one board in three before the guide stopped generating it with
   * base64. Coolify's plain `SERVICE_PASSWORD_` generator emits alphanumerics;
   * `SERVICE_BASE64_*` does not, and swapping one for the other here would be a
   * one-word edit that breaks a third of deploys.
   */
  it('generates the database password from an alphabet a URL can carry', () => {
    expect(compose).toMatch(/DATABASE_URL[=:] ?postgres:\/\/community:\$SERVICE_PASSWORD_POSTGRES@/)
    expect(compose).not.toMatch(/postgres:\/\/community:\$SERVICE_BASE64/)
  })
})
