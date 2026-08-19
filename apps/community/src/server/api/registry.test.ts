import { describe, expect, it } from 'vitest'

import { ROUTES, routeKey } from '@meith/api'

import { DECLARED_ROUTES, handlerFor, IMPLEMENTED_ROUTES } from './registry'

describe('the API surface', () => {
  it('declares every route the registry does', () => {
    expect([...DECLARED_ROUTES].sort()).toEqual(ROUTES.map(routeKey).sort())
  })

  it('implements nothing that is not declared', () => {
    for (const implemented of IMPLEMENTED_ROUTES) {
      expect(DECLARED_ROUTES).toContain(implemented)
    }
  })

  it('has implemented at least one route', () => {
    expect(IMPLEMENTED_ROUTES.length).toBeGreaterThan(0)
  })

  it('reports the unimplemented remainder', () => {
    const pending = DECLARED_ROUTES.filter((route) => !IMPLEMENTED_ROUTES.includes(route))
    expect(pending).toEqual([])
  })

  it('hands back a handler for every declared route', () => {
    for (const route of ROUTES) {
      expect(handlerFor(routeKey(route))).not.toBeNull()
    }
  })

  it('hands back nothing for a route nobody declared', () => {
    expect(handlerFor('GET /nothing-here')).toBeNull()
  })
})
