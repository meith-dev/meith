/**
 * F83 at the app layer.
 *
 * The decisions are tested in `@forum/install`; what is left here is the part
 * that reads the environment, and the one claim that matters most on this page:
 * **it must not throw.** The installer is the screen somebody loads when their
 * board is misconfigured, so a probe that propagated a connection failure would
 * turn "your DATABASE_URL is wrong" into a 500 — on the one page whose entire
 * purpose is explaining what is wrong.
 *
 * The suite runs in fixture mode (vitest's `DATA_SOURCE=fixture`), which is also
 * the case a preflight has to handle: a board that has not been pointed at a
 * database at all.
 */
import { blockers, canProceed } from '@forum/install'
import { describe, expect, it } from 'vitest'

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

  /*
   * No connection was attempted, so there is nothing to say about connecting.
   * A preflight that reported "the database refused the connection" to somebody
   * who has not configured one would send them debugging the wrong thing.
   */
  it('says nothing about a connection it never attempted', async () => {
    const ids = (await gatherPreflight()).map((check) => check.id)
    expect(ids).not.toContain('connect')
  })

  /*
   * Fixture mode cannot be sealed — there is no store to hold the marker — and
   * the honest answer is "not installed" rather than an error. It also means the
   * route stays reachable on a sample-data board, which is correct: that is the
   * board somebody is about to point at a real database.
   */
  it('is not sealed', async () => {
    await expect(installerIsSealed()).resolves.toBe(false)
  })
})
