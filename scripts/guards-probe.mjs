#!/usr/bin/env node
import { GUARDS } from './guards.config.mjs'

let failures = 0

function fail(id, message) {
  console.error(`\n✖ ${id}`)
  console.error(`  ${message}`)
  failures++
}

for (const guard of GUARDS) {
  if (!guard.probe) {
    fail(guard.id, 'has no probe. Every guard must carry one — see guards.config.mjs.')
    continue
  }

  const { violates, clean } = guard.probe

  guard.pattern.lastIndex = 0
  if (!guard.pattern.test(violates)) {
    fail(
      guard.id,
      `is INERT: its violating sample no longer matches.\n` +
        `  sample:  ${JSON.stringify(violates)}\n` +
        `  pattern: ${guard.pattern}`,
    )
  }

  for (const sample of [clean, ...(guard.alsoClean ?? [])]) {
    guard.pattern.lastIndex = 0
    if (guard.pattern.test(sample)) {
      fail(
        guard.id,
        `is TOO BROAD: it matches a sample that is meant to be legal.\n` +
          `  sample:  ${JSON.stringify(sample)}\n` +
          `  pattern: ${guard.pattern}`,
      )
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} guard probe failure(s).\n`)
  process.exit(1)
}
console.log(`✓ all ${GUARDS.length} guards fire on a violation and spare a clean sample`)
