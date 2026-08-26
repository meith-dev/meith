import { afterEach, describe, expect, it, vi } from 'vitest'

const CONFIG = '../../next.config.mjs'

async function outputMode(vercel: string | undefined): Promise<unknown> {
  const previous = process.env.VERCEL

  if (vercel === undefined) delete process.env.VERCEL
  else process.env.VERCEL = vercel

  vi.resetModules()

  try {
    const loaded = (await import(CONFIG)) as { default: { output?: unknown } }
    return loaded.default.output
  } finally {
    if (previous === undefined) delete process.env.VERCEL
    else process.env.VERCEL = previous
  }
}

afterEach(() => {
  vi.resetModules()
})

describe('the output mode the board builds in', () => {
  it('asks for a standalone server everywhere it has to serve itself', async () => {
    await expect(outputMode(undefined)).resolves.toBe('standalone')
  })

  it('leaves the output mode to Vercel, which packages the build itself', async () => {
    await expect(outputMode('1')).resolves.toBeUndefined()
  })
})
