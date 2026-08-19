import { describe, expect, it } from 'vitest'

import {
  COMPONENT_NAMES,
  openApiDocument,
  openApiPath,
  operationId,
  ROUTES,
  routeKey,
  SCOPES,
} from './index'

const DOCUMENT = openApiDocument('9.9.9')

function operations(): readonly [string, string, Record<string, unknown>][] {
  const out: [string, string, Record<string, unknown>][] = []
  for (const [path, methods] of Object.entries(DOCUMENT.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      out.push([method, path, operation as Record<string, unknown>])
    }
  }
  return out
}

function refsIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(refsIn)
  if (typeof value !== 'object' || value === null) return []

  const record = value as Record<string, unknown>
  const here = typeof record.$ref === 'string' ? [record.$ref] : []

  return [...here, ...Object.values(record).flatMap(refsIn)]
}

describe('the OpenAPI document', () => {
  it('carries the version it was built for', () => {
    expect((DOCUMENT.info as { version: string }).version).toBe('9.9.9')
  })

  it('describes every route in the registry and nothing else', () => {
    const described = operations()
      .map(([method, path]) => `${method.toUpperCase()} ${path}`)
      .sort()

    expect(described).toEqual(
      ROUTES.map((route) => `${route.method} ${openApiPath(route.path)}`).sort(),
    )
  })

  it('writes path parameters in the OpenAPI style, not the router’s', () => {
    for (const path of Object.keys(DOCUMENT.paths)) {
      expect(path).not.toContain(':')
    }
    expect(openApiPath('/threads/:threadId/posts/:postId')).toBe(
      '/threads/{threadId}/posts/{postId}',
    )
  })

  it('gives every operation a unique id', () => {
    const ids = operations().map(([, , operation]) => operation.operationId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds an operation id from the method and the path', () => {
    expect(
      operationId({
        method: 'DELETE',
        path: '/threads/:threadId/posts/:postId',
      } as (typeof ROUTES)[number]),
    ).toBe('deleteThreadsByThreadIdPostsByPostId')
  })

  it('resolves every schema reference it makes', () => {
    const schemas = (DOCUMENT.components as { schemas: Record<string, unknown> }).schemas

    for (const reference of refsIn(DOCUMENT.paths)) {
      const name = reference.replace('#/components/schemas/', '')
      expect(Object.keys(schemas)).toContain(name)
    }
  })

  it('references every schema it defines, so the spec carries no dead weight', () => {
    const referenced = new Set(
      refsIn(DOCUMENT).map((reference) => reference.replace('#/components/schemas/', '')),
    )

    expect(COMPONENT_NAMES.filter((name) => !referenced.has(name))).toEqual([])
  })

  it('lets an unauthenticated caller in only where the registry does', () => {
    for (const [method, path, operation] of operations()) {
      const security = operation.security as readonly Record<string, unknown>[]
      const anonymous = security.some((option) => Object.keys(option).length === 0)
      const route = ROUTES.find(
        (candidate) =>
          candidate.method === method.toUpperCase() && openApiPath(candidate.path) === path,
      )

      expect(anonymous).toBe(route?.authenticated === false)
    }
  })

  it('still names the scope on an anonymous route, because a token only ever narrows', () => {
    for (const [, , operation] of operations()) {
      const security = operation.security as readonly Record<string, readonly string[]>[]
      const bearer = security.find((option) => 'bearerToken' in option)
      expect(bearer?.bearerToken).toEqual([operation['x-scope']])
    }
  })

  it('prices every operation and never at nothing', () => {
    for (const [, , operation] of operations()) {
      expect(operation['x-rate-limit-cost']).toBeGreaterThan(0)
    }
  })

  it('lists the endpoints each scope reaches', () => {
    expect(Object.keys(DOCUMENT['x-scopes']).sort()).toEqual([...SCOPES].sort())

    for (const [scope, keys] of Object.entries(DOCUMENT['x-scopes'])) {
      expect(keys.length).toBeGreaterThan(0)
      for (const key of keys) {
        expect(ROUTES.find((route) => routeKey(route) === key)?.scope).toBe(scope)
      }
    }
  })

  it('offers the error shape on every operation, so a client parses one thing', () => {
    for (const [, , operation] of operations()) {
      const responses = operation.responses as Record<string, unknown>
      for (const status of ['403', '404', '429', '503']) {
        expect(Object.keys(responses)).toContain(status)
      }
    }
  })

  it('documents the refusal a write can meet and a read cannot', () => {
    for (const [method, , operation] of operations()) {
      const responses = Object.keys(operation.responses as Record<string, unknown>)
      expect(responses.includes('422')).toBe(method !== 'get')
      expect(responses.includes('400')).toBe(method === 'get')
    }
  })

  it('documents a 401 only where a token is required', () => {
    for (const [method, path, operation] of operations()) {
      const responses = Object.keys(operation.responses as Record<string, unknown>)
      const route = ROUTES.find(
        (candidate) =>
          candidate.method === method.toUpperCase() && openApiPath(candidate.path) === path,
      )

      expect(responses.includes('401')).toBe(route?.authenticated === true)
    }
  })

  it('refuses unknown fields on every request body it accepts', () => {
    for (const [, , operation] of operations()) {
      const request = operation.requestBody as
        | { content: { 'application/json': { schema: Record<string, unknown> } } }
        | undefined
      if (request === undefined) continue

      expect(request.content['application/json'].schema.additionalProperties).toBe(false)
    }
  })
})
