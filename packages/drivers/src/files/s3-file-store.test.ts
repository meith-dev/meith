import { describe, expect, it } from 'vitest'

import { S3FileStore, type S3Like } from './s3-file-store'

const CONFIG = {
  bucket: 'board',
  region: 'auto',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
}

function pagedSender(pages: readonly (readonly string[])[]): S3Like & { calls: unknown[] } {
  let call = 0
  const sender = {
    calls: [] as unknown[],
    send(command: unknown): Promise<unknown> {
      sender.calls.push((command as { input: unknown }).input)
      const page = pages[call] ?? []
      call++
      return Promise.resolve({
        Contents: page.map((key) => ({ Key: key })),
        IsTruncated: call < pages.length,
        NextContinuationToken: call < pages.length ? `token-${call}` : undefined,
      })
    },
  }
  return sender
}

describe('S3FileStore.listKeys', () => {
  it('walks every page of the bucket', async () => {
    const sender = pagedSender([['avatars/a.png', 'avatars/b.png'], ['attachments/c.pdf']])
    const store = new S3FileStore(CONFIG, sender)

    const keys: string[] = []
    for await (const key of store.listKeys()) keys.push(key)

    expect(keys).toEqual(['avatars/a.png', 'avatars/b.png', 'attachments/c.pdf'])
    expect(sender.calls).toHaveLength(2)
    expect(sender.calls[1]).toMatchObject({ ContinuationToken: 'token-1' })
  })

  it('finishes an empty bucket without a second request', async () => {
    const sender = pagedSender([[]])
    const store = new S3FileStore(CONFIG, sender)

    const keys: string[] = []
    for await (const key of store.listKeys()) keys.push(key)

    expect(keys).toEqual([])
    expect(sender.calls).toHaveLength(1)
  })
})
