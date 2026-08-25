import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../../')

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8')
}

function wasmSpecifiers(): string[] {
  const codec = read('packages/drivers/src/images/codec.ts')
  return [...codec.matchAll(/'(@jsquash\/[^']+\.wasm)'/g)].map((match) => match[1] as string)
}

function externalPackages(): string[] {
  const config = read('apps/community/next.config.mjs')
  const block = /serverExternalPackages:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? ''
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] as string)
}

describe('WebAssembly assets survive output file tracing', () => {
  it('finds the codec specifiers it is guarding', () => {
    expect(wasmSpecifiers().length).toBeGreaterThan(0)
  })

  it.each(wasmSpecifiers())('keeps the package owning %s external', (specifier) => {
    const owner = specifier.split('/').slice(0, 2).join('/')

    expect(externalPackages()).toContain(owner)
  })
})
