/**
 * Test-only helpers for `@forum/accounts`.
 *
 * Lives in the package rather than `@forum/testkit` because that depends on
 * `@forum/db`, which depends on this — importing it here would be a cycle.
 *
 * Named `.fixture.ts` to match `pglite.fixture.ts`: dependency-cruiser excludes
 * `.test.ts` from the graph, so a helper only tests import would otherwise be
 * reported as an orphan module.
 */

/**
 * The message of the error a promise rejects with.
 *
 * `p.catch((e) => e as Error)` types as `Error | T`, so reading `.message` off
 * it does not compile; every use of that shape in this repo has had to be
 * rewritten. This narrows properly and fails loudly if the promise *resolves*,
 * which a bare catch would silently treat as a pass.
 */
export async function rejectionMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('expected the promise to reject, but it resolved')
}
