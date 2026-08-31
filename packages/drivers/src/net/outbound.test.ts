import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertSafeMailEndpoint,
  assertSafeSmtpHost,
  BlockedOutboundError,
  guardedMailTransport,
  isBlockedAddress,
  type MailRequest,
} from './outbound'

describe('isBlockedAddress', () => {
  const blocked = [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.5.4',
    '192.168.0.10',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '64:ff9b::7f00:1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
  ]

  const allowed = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '::ffff:8.8.8.8', '2606:4700:4700::1111']

  for (const address of blocked) {
    it(`blocks ${address}`, () => {
      expect(isBlockedAddress(address)).toBe(true)
    })
  }

  for (const address of allowed) {
    it(`allows ${address}`, () => {
      expect(isBlockedAddress(address)).toBe(false)
    })
  }

  it('treats a value that is not an IP as blocked', () => {
    expect(isBlockedAddress('not-an-address')).toBe(true)
  })
})

describe('assertSafeMailEndpoint', () => {
  it('accepts an ordinary https provider endpoint', () => {
    expect(assertSafeMailEndpoint('https://api.resend.com/emails', false).host).toBe(
      'api.resend.com',
    )
  })

  it('rejects a plaintext endpoint unless private hosts are allowed', () => {
    expect(() => assertSafeMailEndpoint('http://api.resend.com/emails', false)).toThrow(
      BlockedOutboundError,
    )
    expect(assertSafeMailEndpoint('http://api.resend.com/emails', true).protocol).toBe('http:')
  })

  it('rejects an endpoint carrying credentials', () => {
    expect(() => assertSafeMailEndpoint('https://user:pass@api.example/x', false)).toThrow(
      /username or password/,
    )
  })

  it('rejects a private address literal, including alternate numeric forms', () => {
    expect(() => assertSafeMailEndpoint('https://127.0.0.1/x', false)).toThrow(BlockedOutboundError)
    expect(() => assertSafeMailEndpoint('https://2130706433/x', false)).toThrow(
      BlockedOutboundError,
    )
    expect(() => assertSafeMailEndpoint('https://0x7f000001/x', false)).toThrow(
      BlockedOutboundError,
    )
    expect(() => assertSafeMailEndpoint('https://[::1]/x', false)).toThrow(BlockedOutboundError)
    expect(() => assertSafeMailEndpoint('https://169.254.169.254/latest', false)).toThrow(
      BlockedOutboundError,
    )
  })

  it('lets a private literal through only when private hosts are allowed', () => {
    expect(assertSafeMailEndpoint('https://127.0.0.1/x', true).hostname).toBe('127.0.0.1')
  })

  it('rejects a value that is not a URL', () => {
    expect(() => assertSafeMailEndpoint('not a url', false)).toThrow(BlockedOutboundError)
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

  it('refuses a private destination literal when private hosts are not allowed', async () => {
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

  it('refuses a name that resolves to a private address', async () => {
    await expect(
      guardedMailTransport({
        url: new URL('http://localhost:1/emails'),
        headers: {},
        body: '{}',
        timeoutMs: 5_000,
        allowPrivateHosts: false,
      }),
    ).rejects.toThrow(BlockedOutboundError)
  })

  it('delivers the body and headers, and reports the status', async () => {
    let seen: { method: string | undefined; auth: string | undefined; body: string } = {
      method: undefined,
      auth: undefined,
      body: '',
    }
    const port = await listen((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        seen = { method: req.method, auth: req.headers.authorization, body }
        res.writeHead(200)
        res.end('ok')
      })
    })

    const result = await guardedMailTransport(request(port))

    expect(result.status).toBe(200)
    expect(result.diagnostic).toBe('ok')
    expect(seen.method).toBe('POST')
    expect(seen.auth).toBe('Bearer key')
    expect(JSON.parse(seen.body)).toEqual({ to: 'x@example.test' })
  })

  it('reports a non-success status with a bounded diagnostic', async () => {
    const port = await listen((_req, res) => {
      res.writeHead(503)
      res.end('x'.repeat(500))
    })

    const result = await guardedMailTransport(request(port))

    expect(result.status).toBe(503)
    expect(result.diagnostic).toHaveLength(200)
  })

  it('does not follow redirects', async () => {
    const port = await listen((_req, res) => {
      res.writeHead(302, { location: 'https://elsewhere.example/' })
      res.end()
    })

    const result = await guardedMailTransport(request(port))

    expect(result.status).toBe(302)
  })
})
