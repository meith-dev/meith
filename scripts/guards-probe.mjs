#!/usr/bin/env node
/**
 * Proves the textual guards are not inert (D10).
 *
 * `pnpm guards` passing tells you nothing on its own: a rule whose pattern no
 * longer matches anything passes exactly as loudly as a rule that is doing its
 * job. Every guard this repo has ever added was probed by hand with a
 * deliberately-broken file; this makes that permanent and runs it in CI, so a
 * refactor that quietly defangs a pattern fails immediately instead of years
 * later when the bug it was watching for comes back.
 *
 * Two assertions per guard, and the second is the one people forget:
 *
 *   1. the violating sample MUST match — the rule still catches its bug;
 *   2. the clean sample MUST NOT — the rule has not been broadened into
 *      something that matches everything, which would satisfy (1) trivially
 *      while making the guard useless and the build unfixable.
 *
 * Run: pnpm guards:probe
 */

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

  // `exec` on a /g regex is stateful; these are not global, but reset anyway so
  // this stays correct if one ever becomes so.
  guard.pattern.lastIndex = 0
  if (!guard.pattern.test(violates)) {
    fail(
      guard.id,
      `is INERT: its violating sample no longer matches.\n` +
        `  sample:  ${JSON.stringify(violates)}\n` +
        `  pattern: ${guard.pattern}`,
    )
  }

  /*
   * `alsoClean` carries the extra legal samples a rule with a carve-out needs.
   * A single `clean` cannot prove both that a rule still fires and that each of
   * its exemptions holds, and an exemption nobody probes is one that quietly
   * widens until the rule means nothing.
   */
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
