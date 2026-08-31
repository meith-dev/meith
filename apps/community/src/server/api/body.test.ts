import { describe, expect, it } from 'vitest'

import { MAX_API_BODY_BYTES, readJsonBody } from './body'

function jsonPost(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://board.example/api/v1/threads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

function streamedPost(bytes: Uint8Array): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Request('https://board.example/api/v1/threads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

describe('readJsonBody', () => {
  it('parses a JSON object within the limit', async () => {
    const outcome = await readJsonBody(jsonPost('{"title":"Hello"}'))
    expect(outcome).toEqual({ kind: 'ok', body: { title: 'Hello' } })
  })

  it('yields a null body for JSON that is not an object', async () => {
    expect(await readJsonBody(jsonPost('42'))).toEqual({ kind: 'ok', body: null })
    expect(await readJsonBody(jsonPost('"just a string"'))).toEqual({ kind: 'ok', body: null })
  })

  it('yields a null body for an empty request', async () => {
    expect(await readJsonBody(jsonPost(''))).toEqual({ kind: 'ok', body: null })
  })

  it('reports malformed JSON distinctly from an oversized body', async () => {
    expect(await readJsonBody(jsonPost('{not json'))).toEqual({ kind: 'invalid' })
  })

  it('rejects an oversized declared content-length before reading', async () => {
    expect(await readJsonBody(jsonPost('{"a":1}'.padEnd(64, ' ')), 10)).toEqual({
      kind: 'too-large',
    })
  })

  it('rejects an oversized streamed body that declares no length', async () => {
    const oversized = new TextEncoder().encode('x'.repeat(50))
    expect(await readJsonBody(streamedPost(oversized), 10)).toEqual({ kind: 'too-large' })
  })

  it('accepts a body exactly at the limit', async () => {
    const payload = '{"a":1}'
    expect(await readJsonBody(jsonPost(payload), payload.length)).toEqual({
      kind: 'ok',
      body: { a: 1 },
    })
  })

  it('has a conservative default limit', () => {
    expect(MAX_API_BODY_BYTES).toBe(256 * 1024)
  })
})
