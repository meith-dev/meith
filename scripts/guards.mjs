#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

import { domainPackages } from './domain-packages.cjs'
import { GUARDS } from './guards.config.mjs'
import { repoFiles } from './repo-files.mjs'

const DOMAIN_PATH = new RegExp(`^packages/(${domainPackages().join('|')})/`)

function isDomainPath(rel) {
  return DOMAIN_PATH.test(rel)
}

const files = await repoFiles()
let failures = 0

for (const guard of GUARDS) {
  for (const { abs, rel } of files) {
    if (!guard.files.test(rel)) continue
    if (guard.allow?.test(rel)) continue
    if (guard.id === 'no-next-in-domain' && !isDomainPath(rel)) continue

    const source = await readFile(abs, 'utf8')
    guard.pattern.lastIndex = 0
    const match = guard.pattern.exec(source)
    if (!match) continue

    const line = source.slice(0, match.index).split('\n').length
    console.error(`\n✖ ${guard.id}`)
    console.error(`  ${rel}:${line}`)
    console.error(`  found: ${match[0].slice(0, 80).replace(/\n/g, ' ⏎ ')}`)
    console.error(`  why:   ${guard.why}`)
    failures++
  }
}

if (failures > 0) {
  console.error(`\n${failures} invariant violation(s).\n`)
  process.exit(1)
}
console.log('✓ all textual invariants hold')
