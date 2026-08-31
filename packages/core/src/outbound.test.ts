import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertAllowedUrl,
  BlockedOutboundError,
  guardedRequest,
  isBlockedAddress,
  type OutboundRequest,
} from './outbound'

describe('isBlockedAddress', () => {
  const blocked = [
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.5.4',
    '192.168.0.10',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
  ]
  const allowed = ['8.8.8.8', '1.1.1.1', '::ffff:8.8.8.8', '2606:4700:4700::1111']

  for (const address of blocked) {
    it(`blocks ${address}`, () => expect(isBlockedAddress(address)).toBe(true))
  }
  for (const address of allowed) {
    it(`allows ${address}`, () => expect(isBlockedAddress(address)).toBe(false))
  }

  it('treats a non-IP value as blocked', () => {
    expect(isBlockedAddress('nope')).toBe(true)
  })
})

describe('assertAllowedUrl', () => {
  it('accepts an ordinary https destination', () => {
    expect(
      assertAllowedUrl('https://subscriber.test/hook', { allowPrivateHosts: false }).host,
    ).toBe('subscriber.test')
  })

  it('rejects plaintext unless private hosts are allowed', () => {
    expect(() =>
      assertAllowedUrl('http://subscriber.test/hook', { allowPrivateHosts: false }),
    ).toThrow(BlockedOutboundError)
    expect(
      assertAllowedUrl('http://subscriber.test/hook', { allowPrivateHosts: true }).protocol,
    ).toBe('http:')
  })

  it('rejects credentials in the URL', () => {
    expect(() =>
      assertAllowedUrl('https://u:p@subscriber.test/x', { allowPrivateHosts: false }),
    ).toThrow(/username or password/)
  })

  it('rejects private literals, including alternate numeric forms', () => {
    for (const url of [
      'https://127.0.0.1/x',
      'https://2130706433/x',
      'https://[::1]/x',
      'https://169.254.169.254/latest',
    ]) {
      expect(() => assertAllowedUrl(url, { allowPrivateHosts: false })).toThrow(
        BlockedOutboundError,
      )
    }
  })

  it('allows a private literal when private hosts are allowed', () => {
    expect(assertAllowedUrl('http://127.0.0.1:9000/x', { allowPrivateHosts: true }).hostname).toBe(
      '127.0.0.1',
    )
  })
})

describe('guardedRequest', () => {
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

  function attempt(port: number, overrides: Partial<OutboundRequest> = {}): OutboundRequest {
    return {
      url: new URL(`http://127.0.0.1:${port}/hook`),
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"x":1}',
      timeoutMs: 5_000,
      allowPrivateHosts: true,
      ...overrides,
    }
  }

  it('refuses a private destination literal when private hosts are not allowed', async () => {
    await expect(
      guardedRequest({
        url: new URL('http://127.0.0.1:1/hook'),
        method: 'POST',
        headers: {},
        body: '{}',
        timeoutMs: 5_000,
        allowPrivateHosts: false,
      }),
    ).rejects.toThrow(BlockedOutboundError)
  })

  it('refuses a name that resolves to a private address', async () => {
    await expect(
      guardedRequest({
        url: new URL('http://localhost:1/hook'),
        method: 'POST',
        headers: {},
        body: '{}',
        timeoutMs: 5_000,
        allowPrivateHosts: false,
      }),
    ).rejects.toThrow(BlockedOutboundError)
  })

  it('delivers the body and reports the status', async () => {
    let received = ''
    const port = await listen((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        received = body
        res.writeHead(200)
        res.end('ok')
      })
    })

    const result = await guardedRequest(attempt(port))

    expect(result.status).toBe(200)
    expect(JSON.parse(received)).toEqual({ x: 1 })
  })

  it('does not follow redirects', async () => {
    const port = await listen((_req, res) => {
      res.writeHead(302, { location: 'https://elsewhere.example/' })
      res.end()
    })

    const result = await guardedRequest(attempt(port))

    expect(result.status).toBe(302)
  })
})
