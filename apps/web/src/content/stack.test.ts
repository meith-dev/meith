import { describe, expect, it } from 'vitest'

import { major, readStack } from './stack'

describe('what the homepage says Meith is built on', () => {
  it('reads a major version for every part of the stack from the repository', async () => {
    const stack = await readStack()

    expect(Object.keys(stack)).toEqual(['node', 'typescript', 'next', 'react', 'postgres'])
    for (const version of Object.values(stack)) {
      expect(version).toMatch(/^\d+$/)
      expect(Number(version)).toBeGreaterThan(0)
    }
  })

  it('says which file stopped stating a version, and where the pattern lives', () => {
    expect(() =>
      major('docker/Dockerfile', 'FROM alpine', /^FROM node:(\d+)/m, 'the Node.js image'),
    ).toThrow(/docker\/Dockerfile no longer states the Node.js image[\s\S]*stack\.ts/)
  })
})
