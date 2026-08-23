import { describe, expect, it } from 'vitest'

import { isUsableFeedUrl } from './origin'

describe('isUsableFeedUrl', () => {
  it('accepts an https URL', () => {
    expect(isUsableFeedUrl('https://www.meith.dev/marketplace/v1.json')).toBe(true)
  })

  it('accepts plain http to a loopback address, for a local mirror or a test double', () => {
    expect(isUsableFeedUrl('http://127.0.0.1:12112/v1.json')).toBe(true)
    expect(isUsableFeedUrl('http://localhost:3000/v1.json')).toBe(true)
    expect(isUsableFeedUrl('http://[::1]:3000/v1.json')).toBe(true)
  })

  it('refuses plain http to anything that is not a loopback address', () => {
    expect(isUsableFeedUrl('http://mirror.example/v1.json')).toBe(false)
  })

  it('refuses a scheme that is neither http nor https', () => {
    expect(isUsableFeedUrl('ftp://mirror.example/v1.json')).toBe(false)
    expect(isUsableFeedUrl('javascript:alert(1)')).toBe(false)
  })

  it('refuses a value that does not parse as a URL', () => {
    expect(isUsableFeedUrl('not a url')).toBe(false)
    expect(isUsableFeedUrl('')).toBe(false)
  })
})
