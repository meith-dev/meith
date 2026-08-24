#!/usr/bin/env node
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { GUARDS } from './guards.config.mjs'
import { ROOT, repoFiles } from './repo-files.mjs'

let failures = 0

function fail(id, message) {
  console.error(`\n✖ ${id}`)
  console.error(`  ${message}`)
  failures++
}

const TOP_LEVEL = new Set(['apps', 'packages', 'themes', 'plugins', 'examples', 'scripts', 'e2e'])

function namedPaths(source) {
  const plain = source.replace(/\\\//g, '/')
  return new Set(
    [...plain.matchAll(/(?<![\w-])([\w-]+(?:\/[\w-]+)+)/g)]
      .map((m) => m[1])
      .filter((path) => TOP_LEVEL.has(path.split('/')[0])),
  )
}

async function exists(path, files) {
  try {
    if ((await stat(join(ROOT, path))).isDirectory()) return true
  } catch {
    /* empty */
  }
  return files.some(({ rel }) => rel.startsWith(path))
}

const files = await repoFiles()

for (const guard of GUARDS) {
  if (!guard.probe) {
    fail(guard.id, 'has no probe. Every guard must carry one — see guards.config.mjs.')
    continue
  }

  const { violates, clean } = guard.probe

  for (const sample of [violates, ...(guard.alsoViolates ?? [])]) {
    guard.pattern.lastIndex = 0
    if (!guard.pattern.test(sample)) {
      fail(
        guard.id,
        `is INERT: a violating sample no longer matches.\n` +
          `  sample:  ${JSON.stringify(sample)}\n` +
          `  pattern: ${guard.pattern}`,
      )
    }
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

  for (const source of [guard.files.source, guard.allow?.source ?? '']) {
    for (const path of namedPaths(source)) {
      if (await exists(path, files)) continue
      fail(
        guard.id,
        `names a path that does not exist: ${path}\n` +
          `  pattern: /${source}/\n` +
          `  A renamed directory silently narrows a guard instead of breaking it, ` +
          `so the rule keeps reporting success over code it no longer reads.`,
      )
    }
  }

  const watched = files.filter(({ rel }) => guard.files.test(rel) && !guard.allow?.test(rel))
  if (watched.length === 0) {
    fail(
      guard.id,
      `is UNSCOPED: its files pattern matches no file in the repository, so it can ` +
        `never fail no matter what anyone writes.\n` +
        `  files:   ${guard.files}\n` +
        `  allow:   ${guard.allow ?? '(none)'}\n` +
        `  A directory it names has almost certainly been renamed or removed. ` +
        `Repoint it at the current path — deleting the guard is the other honest ` +
        `option, but leaving it matching nothing is not.`,
    )
  }
}

if (failures > 0) {
  console.error(`\n${failures} guard probe failure(s).\n`)
  process.exit(1)
}
console.log(
  `✓ all ${GUARDS.length} guards fire on a violation, spare a clean sample, and watch a real path`,
)
