import { createClient } from 'redis'
import { describe, expect, it } from 'vitest'

function socketOptions(url: string): { tls?: boolean; host?: string; port?: number } {
  const client = createClient({ url })
  return (client as { options?: { socket?: Record<string, unknown> } }).options?.socket ?? {}
}

describe('the connection string a managed Redis hands an operator', () => {
  it('turns rediss:// into a TLS socket, which every managed provider requires', () => {
    expect(socketOptions('rediss://cache.upstash.example:6379').tls).toBe(true)
  })

  it('leaves redis:// in the clear, for a sidecar on a private network', () => {
    expect(socketOptions('redis://127.0.0.1:6379').tls).toBe(false)
  })

  it('carries the host and port through either scheme', () => {
    expect(socketOptions('rediss://cache.upstash.example:6380')).toMatchObject({
      host: 'cache.upstash.example',
      port: 6380,
    })
  })

  it('accepts the credentials a provider URL embeds', () => {
    const client = createClient({ url: 'rediss://default:token@cache.upstash.example:6379' })
    const options = client as { options?: { username?: string; password?: string } }

    expect(options.options?.username).toBe('default')
    expect(options.options?.password).toBe('token')
  })
})
