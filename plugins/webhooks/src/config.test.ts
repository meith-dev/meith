import { describe, expect, it } from 'vitest'

import { endpointProblem, isDeliverable, resolveWebhooksConfig } from './config'

describe('resolving the settings', () => {
  it('reads every field, trimming what an operator pasted', () => {
    expect(
      resolveWebhooksConfig({
        endpoint_url: '  https://hooks.example/abc  ',
        format: 'json',
        events: 'threads-and-posts',
        board_url: 'https://board.example/',
        signing_secret: ' s3cret ',
      }),
    ).toEqual({
      endpointUrl: 'https://hooks.example/abc',
      format: 'json',
      sendPosts: true,
      boardUrl: 'https://board.example',
      signingSecret: 's3cret',
    })
  })

  it('falls back to the Discord preset and threads-only on an empty board', () => {
    expect(resolveWebhooksConfig({})).toEqual({
      endpointUrl: '',
      format: 'discord',
      sendPosts: false,
      boardUrl: '',
      signingSecret: '',
    })
  })

  it('refuses to believe a format it does not implement', () => {
    expect(resolveWebhooksConfig({ format: 'slack' }).format).toBe('discord')
  })
})

describe('whether the endpoint can be delivered to', () => {
  it('says what is wrong rather than only that something is', () => {
    expect(endpointProblem(resolveWebhooksConfig({}))).toBe('missing')
    expect(endpointProblem(resolveWebhooksConfig({ endpoint_url: 'http://hooks.example' }))).toBe(
      'insecure',
    )
    expect(endpointProblem(resolveWebhooksConfig({ endpoint_url: 'not a url' }))).toBe('insecure')
  })

  it('accepts an https endpoint', () => {
    const config = resolveWebhooksConfig({ endpoint_url: 'https://hooks.example/abc' })
    expect(endpointProblem(config)).toBeNull()
    expect(isDeliverable(config)).toBe(true)
  })
})
