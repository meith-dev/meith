import { ANONYMOUS_WINDOW, DEFAULT_WINDOW } from './rate-limit'
import { type ParamSpec, ROUTES, type RouteSpec } from './routes'
import { COMPONENT_NAMES, COMPONENTS, type Schema } from './schema'
import { SCOPES } from './tokens'

export const OPENAPI_VERSION = '3.1.0'

export type JsonSchema = Record<string, unknown>

export interface OpenApiDocument {
  readonly openapi: string
  readonly info: Record<string, unknown>
  readonly servers: readonly Record<string, unknown>[]
  readonly security: readonly Record<string, readonly string[]>[]
  readonly paths: Record<string, Record<string, unknown>>
  readonly components: Record<string, unknown>
  readonly 'x-scopes': Record<string, readonly string[]>
  readonly 'x-rate-limit': Record<string, unknown>
}

export function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

export function jsonSchema(schema: Schema): JsonSchema {
  if ('ref' in schema) {
    const reference = { $ref: `#/components/schemas/${schema.ref}` }
    const described =
      schema.description === undefined
        ? reference
        : { ...reference, description: schema.description }
    return schema.nullable === true ? { anyOf: [described, { type: 'null' }] } : described
  }

  if (schema.type === 'object') {
    return {
      type: 'object',
      ...(schema.description === undefined ? {} : { description: schema.description }),
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([name, child]) => [name, jsonSchema(child)]),
      ),
      required: [...schema.required],
      additionalProperties: false,
    }
  }

  if (schema.type === 'array') {
    return {
      type: 'array',
      ...(schema.description === undefined ? {} : { description: schema.description }),
      items: jsonSchema(schema.items),
    }
  }

  const type = schema.nullable === true ? [schema.type, 'null'] : schema.type

  return {
    type,
    description: schema.description,
    ...(schema.format === undefined ? {} : { format: schema.format }),
    ...(schema.enum === undefined ? {} : { enum: [...schema.enum] }),
  }
}

function parameter(spec: ParamSpec): JsonSchema {
  const { description, ...rest } = jsonSchema(spec.schema) as { description?: string }

  return {
    name: spec.name,
    in: spec.in,
    required: spec.required === true,
    ...(description === undefined ? {} : { description }),
    schema: rest,
  }
}

function errorResponse(description: string): JsonSchema {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  }
}

function responses(route: RouteSpec): JsonSchema {
  const out: JsonSchema = {
    [String(route.response.status)]: {
      description: route.summary,
      content: { 'application/json': { schema: jsonSchema(route.response.schema) } },
    },
    '403': errorResponse('The token lacks the scope, or its owner lacks the permission.'),
    '404': errorResponse('No such resource, or none the caller may see.'),
    '429': errorResponse('Over the window budget, or over the board’s own anti-flood limit.'),
    '503': errorResponse('The board is offline and this caller may not see it.'),
  }

  if (route.authenticated) {
    out['401'] = errorResponse('No bearer token, or the token is not valid.')
  }

  if (route.method === 'GET') {
    out['400'] = errorResponse('A query parameter was missing or unusable.')
  } else {
    out['422'] = errorResponse('The board refused the contents by its own posting rules.')
  }

  return out
}

export function operation(route: RouteSpec): JsonSchema {
  return {
    operationId: operationId(route),
    summary: route.summary,
    tags: [route.scope.split(':')[0]],
    ...(route.authenticated
      ? {}
      : { description: 'Readable without a token, as the board’s guest sees it.' }),
    security: route.authenticated
      ? [{ bearerToken: [route.scope] }]
      : [{ bearerToken: [route.scope] }, {}],
    'x-scope': route.scope,
    'x-rate-limit-cost': route.cost,
    ...(route.params === undefined ? {} : { parameters: route.params.map(parameter) }),
    ...(route.request === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: jsonSchema(route.request) } },
          },
        }),
    responses: responses(route),
  }
}

export function operationId(route: RouteSpec): string {
  const words = route.path
    .split('/')
    .filter((part) => part !== '')
    .map((part) => (part.startsWith(':') ? `by-${part.slice(1)}` : part))
    .join('-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '')

  const verb = route.method.toLowerCase()

  return [verb, ...words]
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('')
}

export function openApiDocument(version: string): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {}

  for (const route of ROUTES) {
    const path = openApiPath(route.path)
    paths[path] = { ...paths[path], [route.method.toLowerCase()]: operation(route) }
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'Meith REST API',
      version,
      summary: 'The read and write surface a client, a bot or an integration talks to.',
      description:
        'A token is a restriction on an actor, never a grant to one. Every request ' +
        'resolves the owner’s permissions and asks the Authorizer, exactly as a page ' +
        'does, in addition to checking the token’s scope — so a token can never reach ' +
        'anything its owner could not. Endpoints marked as readable without a token ' +
        'resolve as the board’s guest through that same path, which is why a private ' +
        'forum stays private to them.',
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: '/api/v1', description: 'This board.' }],
    security: [{ bearerToken: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerToken: {
          type: 'http',
          scheme: 'bearer',
          description: 'A personal access token: `forum_pat_<lookup>_<secret>`.',
        },
      },
      schemas: Object.fromEntries(
        COMPONENT_NAMES.map((name) => [name, jsonSchema(COMPONENTS[name])]),
      ),
    },
    'x-scopes': Object.fromEntries(
      SCOPES.map((scope) => [
        scope,
        ROUTES.filter((route) => route.scope === scope).map(
          (route) => `${route.method} ${route.path}`,
        ),
      ]),
    ),
    'x-rate-limit': {
      window: DEFAULT_WINDOW,
      anonymousWindow: ANONYMOUS_WINDOW,
      description:
        'Metered in units of work, not requests. A token spends against its own ' +
        'budget; an unauthenticated caller spends against a smaller one held per ' +
        'address prefix.',
    },
  }
}
