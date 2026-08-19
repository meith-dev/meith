import { describe, expect, it } from 'vitest'

import { openApiDocument, openApiPath, ROUTES, renderReference, SCOPES } from './index'

const REFERENCE = renderReference(openApiDocument('9.9.9'))

describe('the generated reference', () => {
  it('says it is generated, so nobody edits it by hand', () => {
    expect(REFERENCE).toContain('GENERATED FILE — do not edit.')
  })

  it('counts what the registry holds', () => {
    expect(REFERENCE).toContain(`${ROUTES.length} endpoints, ${SCOPES.length} scopes`)
  })

  it('lists every endpoint with its scope and cost', () => {
    for (const route of ROUTES) {
      expect(REFERENCE).toContain(
        `| \`${route.method}\` | \`${openApiPath(route.path)}\` | \`${route.scope}\` | ${route.cost} |`,
      )
    }
  })

  it('lists every scope', () => {
    for (const scope of SCOPES) {
      expect(REFERENCE).toContain(`- \`${scope}\``)
    }
  })

  it('marks which endpoints answer without a token', () => {
    for (const route of ROUTES) {
      expect(REFERENCE).toContain(
        `| \`${route.scope}\` | ${route.cost} | ${route.authenticated ? 'required' : 'optional'} |`,
      )
    }
  })

  it('points at the machine-readable document rather than being one', () => {
    expect(REFERENCE).toContain('/api/v1/openapi.json')
    expect(REFERENCE).toContain('[`docs/openapi.json`](openapi.json)')
  })

  it('quotes the budgets it is generated from', () => {
    expect(REFERENCE).toContain('**600 units per 300 seconds**')
    expect(REFERENCE).toContain('**120 units per 300 seconds**')
  })

  it('leaves no blank line tripled and ends with exactly one newline', () => {
    expect(REFERENCE).not.toContain('\n\n\n')
    expect(REFERENCE.endsWith('\n')).toBe(true)
    expect(REFERENCE.endsWith('\n\n')).toBe(false)
  })
})
