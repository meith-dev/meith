/**
 * F81 — the registry against the implementation.
 *
 * `ROUTES` is the *documented* set and the handler's switch is the *implemented*
 * one. They are allowed to differ — a route can be declared before it is
 * written — but the difference has to be visible in a test rather than
 * discovered by somebody's client, which is why both lists are exported and
 * compared here.
 */
import { ROUTES } from '@forum/api'
import { describe, expect, it } from 'vitest'

import { DECLARED_ROUTES, IMPLEMENTED_ROUTES } from '../../app/api/v1/[...path]/route'

describe('the API surface', () => {
  it('declares every route the registry does', () => {
    expect([...DECLARED_ROUTES].sort()).toEqual(
      ROUTES.map((route) => `${route.method} ${route.path}`).sort(),
    )
  })

  /*
   * Every implemented route must be declared. The reverse is not required: a
   * declared route with no handler answers 501, which is honest. An
   * *undeclared* route with a handler would be an endpoint with no scope check,
   * because the scope comes from the registry.
   */
  it('implements nothing that is not declared', () => {
    for (const implemented of IMPLEMENTED_ROUTES) {
      expect(DECLARED_ROUTES).toContain(implemented)
    }
  })

  it('has implemented at least one route', () => {
    expect(IMPLEMENTED_ROUTES.length).toBeGreaterThan(0)
  })

  /* Named, so the gap is a number somebody can see shrinking. */
  it('reports the unimplemented remainder', () => {
    const pending = DECLARED_ROUTES.filter((route) => !IMPLEMENTED_ROUTES.includes(route))
    expect(pending).toEqual([
      'GET /forums/:forumId/threads',
      'GET /threads/:threadId',
      'GET /threads/:threadId/posts',
      'POST /threads/:threadId/posts',
      'GET /search',
    ])
  })
})
