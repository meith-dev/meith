#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, repoFiles } from './repo-files.mjs'

const CATALOG = 'packages/i18n/src/catalogs/en.json'
const BASELINE = 'scripts/i18n-baseline.json'

const WRITE = process.argv.includes('--write')

const problems = []

function fail(message) {
  problems.push(message)
}

const catalog = JSON.parse(await readFile(join(ROOT, CATALOG), 'utf8'))
const catalogKeys = Object.keys(catalog)
const used = new Set()

const sorted = [...catalogKeys].sort()
if (catalogKeys.join('\n') !== sorted.join('\n')) {
  fail(
    `${CATALOG} is not in key order. A catalog is edited by hand in every language it ` +
      'is translated into, and an unordered one makes every diff a search. Sort it.',
  )
}

function literal(expression) {
  const parts = [...expression.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
  return parts
    .map((part) => part[1] ?? part[2] ?? '')
    .join('')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
}

const STRING = String.raw`(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`
const CONCATENATED = new RegExp(String.raw`${STRING}(?:\s*\+\s*${STRING})*`, 's')

function field(block, name) {
  const match = new RegExp(String.raw`\b${name}:\s*(${CONCATENATED.source})`, 's').exec(block)
  return match === null ? null : literal(match[1])
}

function blocks(source, opener) {
  const found = []
  let at = 0

  for (;;) {
    const start = source.indexOf(opener, at)
    if (start === -1) return found

    let depth = 0
    let index = source.indexOf('{', start)
    const from = index

    for (; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }

    found.push(source.slice(from, index + 1))
    at = index
  }
}

function expect(key, english, where) {
  used.add(key)
  const carried = catalog[key]

  if (carried === undefined) {
    fail(`${CATALOG} has no "${key}" for ${where}. Add it with the English text.`)
    return
  }
  if (carried !== english) {
    fail(
      `"${key}" says ${JSON.stringify(carried)} and ${where} says ${JSON.stringify(english)}. ` +
        'They are the same sentence in two places; make them agree.',
    )
  }
}

const definitions = await readFile(join(ROOT, 'packages/settings/src/definitions.ts'), 'utf8')
const groups = new Set()

for (const block of blocks(definitions, 'define({')) {
  const key = field(block, 'key')
  if (key === null) continue

  const group = field(block, 'group')
  if (group !== null) groups.add(group)

  expect(`setting.${key}.label`, field(block, 'label'), `the "${key}" setting`)
  expect(`setting.${key}.description`, field(block, 'description'), `the "${key}" setting`)
}

const groupLabels = await readFile(join(ROOT, 'apps/community/src/view/setting-groups.ts'), 'utf8')
for (const group of groups) {
  const match = new RegExp(String.raw`\b${group}: (${STRING})`).exec(groupLabels)
  if (match === null) {
    fail(`setting-groups.ts names no label for the "${group}" group`)
    continue
  }
  expect(`setting.group.${group}`, literal(match[1]), `the "${group}" group`)
}

const kinds = await readFile(join(ROOT, 'packages/notifications/src/kinds.ts'), 'utf8')
for (const block of blocks(kinds, '  {\n    id:')) {
  const id = field(block, 'id')
  if (id === null) continue

  expect(`notification.${id}.title`, field(block, 'title'), `the "${id}" notification`)
  expect(`notification.${id}.description`, field(block, 'description'), `the "${id}" notification`)
}

const errors = await readFile(join(ROOT, 'packages/core/src/errors.ts'), 'utf8')
const messages = /export const ERROR_MESSAGES = \{([\s\S]*?)\n\}/.exec(errors)
const keys = /export const ERROR_MESSAGE_KEYS = \{([\s\S]*?)\n\}/.exec(errors)

if (messages === null || keys === null) {
  fail('packages/core/src/errors.ts no longer declares ERROR_MESSAGES and ERROR_MESSAGE_KEYS')
} else {
  const byCode = new Map(
    [...keys[1].matchAll(new RegExp(String.raw`(\w+): (${STRING})`, 'g'))].map((match) => [
      match[1],
      literal(match[2]),
    ]),
  )

  for (const match of messages[1].matchAll(new RegExp(String.raw`(\w+): (${STRING})`, 'g'))) {
    const key = byCode.get(match[1])
    if (key === undefined) {
      fail(`ERROR_MESSAGES names ${match[1]} and ERROR_MESSAGE_KEYS does not`)
      continue
    }
    expect(key, literal(match[2]), `the ${match[1]} error`)
  }
}

const files = await repoFiles()
const source = files.filter(({ rel }) => /\.(ts|tsx)$/.test(rel))

const CALL = /\.\s*(?:t|has)\(\s*'([\w.-]+)'/g
const KEY_PREFIX = /^(error|nav|notification|presence|setting|stats|time)\./

for (const { abs, rel } of source) {
  const text = await readFile(abs, 'utf8')
  for (const match of text.matchAll(CALL)) {
    const key = match[1]
    if (!KEY_PREFIX.test(key)) continue

    used.add(key)
    if (catalog[key] === undefined) {
      fail(
        `${rel} reads the message "${key}" and ${CATALOG} does not carry it. ` +
          'A missing message renders as its own key, in every language including English.',
      )
    }
  }
}

const orphans = catalogKeys.filter((key) => !used.has(key))
if (orphans.length > 0) {
  fail(
    `${CATALOG} carries ${orphans.length} message(s) nothing reads: ${orphans.join(', ')}. ` +
      'Translators are asked to translate every one of them, so a message that has ' +
      'outlived its call site costs real work in every language. Delete it.',
  )
}

const PROSE_SURFACE = /^apps\/community\/src\/view\/[^/]+\.ts$/

function proseLiterals(text) {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')

  const found = []
  for (const match of stripped.matchAll(new RegExp(STRING, 'g'))) {
    const value = match[0].slice(1, -1)
    if (isProse(value)) found.push(value)
  }
  return found
}

function isProse(value) {
  if (!/[A-Za-z]{2}.*\s.*[A-Za-z]/.test(value)) return false
  if (value.startsWith('/') || value.startsWith('http') || value.includes('${')) return false
  if (/^[a-z][\w-]*(?:\s+[a-z:[\]][\w:./[\]-]*)+$/.test(value)) return false
  if (/^[A-Z_]+(?:\s+[A-Z_]+)*$/.test(value)) return false
  return true
}

const measured = {}
for (const { abs, rel } of files) {
  if (!PROSE_SURFACE.test(rel) || rel.endsWith('.test.ts')) continue

  const count = proseLiterals(await readFile(abs, 'utf8')).length
  if (count > 0) measured[rel] = count
}

if (WRITE) {
  await writeFile(
    join(ROOT, BASELINE),
    `${JSON.stringify(Object.fromEntries(Object.entries(measured).sort()), null, 2)}\n`,
  )
  console.log(`✓ wrote ${BASELINE}: ${Object.keys(measured).length} files still holding English`)
} else {
  const baseline = JSON.parse(await readFile(join(ROOT, BASELINE), 'utf8'))

  for (const [rel, count] of Object.entries(measured)) {
    const allowed = baseline[rel] ?? 0
    if (count > allowed) {
      fail(
        `${rel} holds ${count} untranslated string(s) and the baseline allows ${allowed}. ` +
          'New user-facing copy goes through the catalog: give it a key in ' +
          `${CATALOG} and read it with the view's Translator. The baseline only ever ` +
          'goes down — run `pnpm i18n:baseline` once a file is extracted.',
      )
    }
  }

  const stale = Object.entries(baseline).filter(([rel, count]) => (measured[rel] ?? 0) < count)
  if (stale.length > 0) {
    fail(
      `${BASELINE} is behind: ${stale
        .map(([rel, count]) => `${rel} allows ${count}, holds ${measured[rel] ?? 0}`)
        .join('; ')}. Run \`pnpm i18n:baseline\` to bank the extraction — a slack ` +
        'baseline lets the next change put the strings back.',
    )
  }
}

if (problems.length > 0) {
  console.error('✗ message catalog:\n')
  for (const problem of problems) console.error(`  - ${problem}\n`)
  process.exit(1)
}

console.log(
  `✓ message catalog: ${catalogKeys.length} messages, every mirrored definition agrees, ` +
    'every key a call site names exists, and no file gained untranslated copy',
)
