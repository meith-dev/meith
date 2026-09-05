#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openApiDocument, renderReference } from '../packages/api/src/index'
import { emitGeneratedDoc } from './generated-doc.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as {
  version: string
}

const document = openApiDocument(manifest.version)
const endpoints = Object.values(document.paths).reduce(
  (total, operations) => total + Object.keys(operations).length,
  0,
)
const scopes = Object.keys(document['x-scopes']).length

await emitGeneratedDoc({
  outputFile: 'docs/reference/openapi.json',
  generated: `${JSON.stringify(document, null, 2)}\n`,
  staleReason:
    'The API registry changed and the OpenAPI document did not. Run `pnpm api:docs` and ' +
    'commit the result — this file is what clients are generated from, and a stale ' +
    'schema is a client that sends fields the board rejects.',
  upToDate: `${endpoints} endpoints`,
  wrote: `${endpoints} endpoints, ${scopes} scopes`,
})

await emitGeneratedDoc({
  outputFile: 'docs/reference/api.md',
  generated: renderReference(document),
  staleReason:
    'The API registry changed and its reference did not. Run `pnpm api:docs` and commit ' +
    'the result — this document is read by people who cannot see the source, and a stale ' +
    'endpoint list is a client that 404s.',
  upToDate: `${endpoints} endpoints`,
  wrote: `${endpoints} endpoints, ${scopes} scopes`,
})
