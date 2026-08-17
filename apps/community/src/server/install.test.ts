import { describe, expect, it } from 'vitest'

import { blockers, canProceed } from '@meith/install'

import { gatherPreflight, installerIsSealed } from './install'

describe('the preflight on a board with no database', () => {
  it('reports rather than throwing', async () => {
    await expect(gatherPreflight()).resolves.toBeDefined()
  })

  it('blocks on the data source and says what to set', async () => {
    const checks = await gatherPreflight()
    const blocked = blockers(checks).map((check) => check.id)

    expect(blocked).toContain('data-source')
    expect(canProceed(checks)).toBe(false)
  })

  it('says nothing about a connection it never attempted', async () => {
    const ids = (await gatherPreflight()).map((check) => check.id)
    expect(ids).not.toContain('connect')
  })

  it('is not sealed', async () => {
    await expect(installerIsSealed()).resolves.toBe(false)
  })
})
