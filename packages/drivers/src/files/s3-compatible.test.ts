import { describe, expect, it } from 'vitest'

import { S3FileStore } from './s3-file-store'

const CONFIG = {
  bucket: 'board',
  region: 'auto',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
}

const R2_ENDPOINT = 'https://acct.r2.cloudflarestorage.com'

interface CapturedRequest {
  readonly path: string
  readonly headers: Record<string, string>
}

function captureRequests(store: S3FileStore): CapturedRequest[] {
  const captured: CapturedRequest[] = []
  const client = (store as unknown as { signingClient: { config: Record<string, unknown> } })
    .signingClient

  client.config.requestHandler = {
    metadata: { handlerProtocol: 'http/1.1' },
    destroy() {},
    updateHttpClientConfig() {},
    httpHandlerConfigs() {
      return {}
    },
    handle(request: CapturedRequest) {
      captured.push({ path: request.path, headers: request.headers })
      return Promise.resolve({ response: { statusCode: 200, headers: {}, body: undefined } })
    },
  }

  return captured
}

const BYTES = new TextEncoder().encode('image bytes')

async function putOne(store: S3FileStore): Promise<CapturedRequest> {
  const captured = captureRequests(store)
  await store.put('avatars/a.png', BYTES, { contentType: 'image/png', visibility: 'private' })
  return captured[0] as CapturedRequest
}

describe('S3FileStore against an S3-compatible endpoint', () => {
  it('sends no flexible-checksum headers, which R2 rejects', async () => {
    const request = await putOne(new S3FileStore({ ...CONFIG, endpoint: R2_ENDPOINT }))

    expect(Object.keys(request.headers)).not.toContain('x-amz-sdk-checksum-algorithm')
    expect(Object.keys(request.headers).filter((n) => n.startsWith('x-amz-checksum-'))).toEqual([])
  })

  it('addresses the bucket path-style, as a custom endpoint requires', async () => {
    const request = await putOne(new S3FileStore({ ...CONFIG, endpoint: R2_ENDPOINT }))

    expect(request.path).toBe('/board/avatars/a.png')
  })

  it('sends no ACL, which R2 rejects outright', async () => {
    const request = await putOne(new S3FileStore({ ...CONFIG, endpoint: R2_ENDPOINT }))

    expect(Object.keys(request.headers)).not.toContain('x-amz-acl')
  })

  it('keeps AWS integrity checksums when no endpoint is configured', async () => {
    const request = await putOne(new S3FileStore({ ...CONFIG, region: 'eu-west-2' }))

    expect(request.headers['x-amz-sdk-checksum-algorithm']).toBeDefined()
  })
})

describe('S3FileStore.url', () => {
  it('includes the bucket for a custom endpoint, matching the signed URL', async () => {
    const store = new S3FileStore({ ...CONFIG, endpoint: R2_ENDPOINT })

    expect(store.url('avatars/a.png')).toBe(`${R2_ENDPOINT}/board/avatars/a.png`)

    expect(await store.signedUrl('avatars/a.png', 60)).toContain('/board/avatars/a.png?')
  })

  it('prefers an explicit public base, which is how R2 serves objects publicly', () => {
    const store = new S3FileStore({
      ...CONFIG,
      endpoint: R2_ENDPOINT,
      publicBaseUrl: 'https://files.example/',
    })

    expect(store.url('avatars/a.png')).toBe('https://files.example/avatars/a.png')
  })

  it('carries S3_PUBLIC_BASE_URL through fromEnv', () => {
    const store = S3FileStore.fromEnv({
      S3_BUCKET: 'board',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
      S3_ENDPOINT: R2_ENDPOINT,
      S3_PUBLIC_BASE_URL: 'https://files.example',
    })

    expect(store.url('avatars/a.png')).toBe('https://files.example/avatars/a.png')
  })
})
