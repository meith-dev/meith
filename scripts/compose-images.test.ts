import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { pinnedComposeImage } from './compose-images.mts'
import { ROOT } from './workspace-packages.mjs'

describe('pinnedComposeImage', () => {
  it("returns the postgres service's digest-pinned reference", async () => {
    const image = await pinnedComposeImage('postgres')

    expect(image).toMatch(/^postgres:[^@]+@sha256:[0-9a-f]{64}$/)
  })

  it('returns the very string docker/compose.yml carries, so the two can never drift', async () => {
    const compose = await readFile(join(ROOT, 'docker/compose.yml'), 'utf8')

    expect(compose).toContain(`image: ${await pinnedComposeImage('postgres')}`)
  })

  it('refuses a service the compose file does not declare', async () => {
    await expect(pinnedComposeImage('nonexistent')).rejects.toThrow(/declares no "nonexistent"/)
  })
})
