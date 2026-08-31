import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertSafeMailEndpoint,
  assertSafeSmtpHost,
  BlockedOutboundError,
  guardedMailTransport,
  type MailRequest,
} from './outbound'

describe('assertSafeMailEndpoint', () => {
  it('accepts an ordinary https provider endpoint', () => {
    expect(assertSafeMailEndpoint('https://api.resend.com/emails', false).host).toBe(
      'api.resend.com',
    )
  })

  it('rejects a plaintext or private endpoint unless private hosts are allowed', () => {
    expect(() => assertSafeMailEndpoint('http://api.resend.com/emails', false)).toThrow(
      BlockedOutboundError,
    )
    expect(() => assertSafeMailEndpoint('https://127.0.0.1/x', false)).toThrow(BlockedOutboundError)
    expect(assertSafeMailEndpoint('http://127.0.0.1:9000/x', true).hostname).toBe('127.0.0.1')
  })
})

describe('assertSafeSmtpHost', () => {
  it('does nothing when private hosts are allowed', async () => {
    await expect(assertSafeSmtpHost('127.0.0.1', true)).resolves.toBeUndefined()
  })

  it('rejects a private host literal', async () => {
    await expect(assertSafeSmtpHost('10.0.0.1', false)).rejects.toThrow(BlockedOutboundError)
  })

  it('accepts a public host literal', async () => {
    await expect(assertSafeSmtpHost('8.8.8.8', false)).resolves.toBeUndefined()
  })

  it('rejects a name that resolves to a loopback address', async () => {
    await expect(assertSafeSmtpHost('localhost', false)).rejects.toThrow(BlockedOutboundError)
  })
})

describe('guardedMailTransport', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => server?.close(() => resolve()))
      server = undefined
    }
  })

  function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<number> {
    const started = createServer(handler)
    server = started
    return new Promise((resolve) => {
      started.listen(0, '127.0.0.1', () => resolve((started.address() as AddressInfo).port))
    })
  }

  function request(port: number, overrides: Partial<MailRequest> = {}): MailRequest {
    return {
      url: new URL(`http://127.0.0.1:${port}/emails`),
      headers: { 'content-type': 'application/json', authorization: 'Bearer key' },
      body: JSON.stringify({ to: 'x@example.test' }),
      timeoutMs: 5_000,
      allowPrivateHosts: true,
      ...overrides,
    }
  }

  it('refuses a private destination when private hosts are not allowed', async () => {
    await expect(
      guardedMailTransport({
        url: new URL('http://127.0.0.1:1/emails'),
        headers: {},
        body: '{}',
        timeoutMs: 5_000,
        allowPrivateHosts: false,
      }),
    ).rejects.toThrow(BlockedOutboundError)
  })

  it('delivers the body and reports the status', async () => {
    let seen = ''
    const port = await listen((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        seen = body
        res.writeHead(200)
        res.end('ok')
      })
    })

    const result = await guardedMailTransport(request(port))

    expect(result.status).toBe(200)
    expect(JSON.parse(seen)).toEqual({ to: 'x@example.test' })
  })
})
