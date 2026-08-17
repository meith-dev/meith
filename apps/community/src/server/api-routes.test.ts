import { describe, expect, it } from 'vitest'

import { ROUTES } from '@meith/api'

import { DECLARED_ROUTES, IMPLEMENTED_ROUTES } from '../../app/api/v1/[...path]/route'

describe('the API surface', () => {
  it('declares every route the registry does', () => {
    expect([...DECLARED_ROUTES].sort()).toEqual(
      ROUTES.map((route) => `${route.method} ${route.path}`).sort(),
    )
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
})
