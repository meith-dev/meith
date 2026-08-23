#!/usr/bin/env node
// Validates marketplace/listings/*.json against marketplace/schema.json and
// the rules a JSON Schema cannot express, then emits the merged feed and its
// screenshots into apps/web's public assets. See docs/marketplace.md.
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { ROOT } from './workspace-packages.mjs'

export const LISTINGS_DIR = 'marketplace/listings'
export const SCHEMA_FILE = 'marketplace/schema.json'
export const SCREENSHOTS_DIR = 'marketplace/screenshots'
export const FEED_FILE = 'apps/web/public/marketplace/v1.json'
export const FEED_SCREENSHOTS_DIR = 'apps/web/public/marketplace/screenshots'

// Mirrors KEY_PATTERN in packages/plugin-kit/src/plugin.ts. A listing key is
// not a plugin key — it namespaces nothing on its own — but a marketplace
// author already knows this rule from writing `definePlugin`, and a second
// rule for the same shape would only be a second thing to get wrong.
const KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const PACKAGE_PATTERN = /^(@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*$/
const SCREENSHOT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*\.png$/
const KINDS = new Set(['plugin', 'theme'])

// Kept in the order marketplace/schema.json declares `required`;
// marketplace-gen.test.ts asserts the two lists stay equal so the schema
// document and this generator cannot silently drift apart.
export const REQUIRED_FIELDS = [
  'key',
  'kind',
  'package',
  'name',
  'description',
  'screenshots',
  'version',
  'apiVersion',
  'meith',
  'repository',
  'licence',
]

// A comparator is `>=`, `<=`, `>`, `<` or `=` (default `=`) against a
// version of one to three numeric parts. Comparators separated by spaces are
// ANDed — enough to write ">=0.16 <1" and nothing more elaborate than that.
const COMPARATOR_PATTERN = /^(>=|<=|>|<|=)?\d+(\.\d+){0,2}$/

export function isValidRange(range) {
  if (typeof range !== 'string' || range.trim() === '') return false
  return range
    .trim()
    .split(/\s+/)
    .every((token) => COMPARATOR_PATTERN.test(token))
}

/**
 * Structural and semantic checks on one parsed listing. Pure — no filesystem
 * access — so it can be unit tested directly against fixture objects.
 * Returns an array of problem strings, each naming the file and the field.
 */
export function validateEntry(file, entry) {
  const problems = []

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return [`${file}: a listing must be a JSON object`]
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in entry)) problems.push(`${file}: missing field "${field}"`)
  }
  for (const field of Object.keys(entry)) {
    if (!REQUIRED_FIELDS.includes(field)) {
      problems.push(
        `${file}: field "${field}" is not part of the marketplace schema — extend it only ` +
          'with maintainer sign-off (see docs/marketplace.md), not by adding a field here',
      )
    }
  }

  if ('key' in entry && (typeof entry.key !== 'string' || !KEY_PATTERN.test(entry.key))) {
    problems.push(
      `${file}: field "key" ("${entry.key}") must be lower-case letters, digits and hyphens, ` +
        'starting with a letter — the same rule definePlugin applies to a plugin key',
    )
  }
  if ('kind' in entry && (typeof entry.kind !== 'string' || !KINDS.has(entry.kind))) {
    problems.push(`${file}: field "kind" ("${entry.kind}") must be "plugin" or "theme"`)
  }
  if (
    'package' in entry &&
    (typeof entry.package !== 'string' || !PACKAGE_PATTERN.test(entry.package))
  ) {
    problems.push(`${file}: field "package" ("${entry.package}") is not a valid npm package name`)
  }
  if ('name' in entry && (typeof entry.name !== 'string' || entry.name.trim() === '')) {
    problems.push(`${file}: field "name" must not be empty`)
  }
  if (
    'description' in entry &&
    (typeof entry.description !== 'string' || entry.description.trim() === '')
  ) {
    problems.push(`${file}: field "description" must not be empty`)
  }
  if ('screenshots' in entry) {
    if (!Array.isArray(entry.screenshots) || entry.screenshots.length === 0) {
      problems.push(`${file}: field "screenshots" must be a non-empty array of filenames`)
    } else {
      for (const shot of entry.screenshots) {
        if (typeof shot !== 'string' || !SCREENSHOT_NAME_PATTERN.test(shot)) {
          problems.push(
            `${file}: field "screenshots" has an invalid filename "${shot}" — lower-case ` +
              'letters, digits and hyphens, ending in ".png"',
          )
        }
      }
    }
  }
  if (
    'version' in entry &&
    (typeof entry.version !== 'string' || !VERSION_PATTERN.test(entry.version))
  ) {
    problems.push(
      `${file}: field "version" ("${entry.version}") must be semver (major.minor.patch) — ` +
        "the listed package's own version, not the repository release version",
    )
  }
  if ('apiVersion' in entry && (!Number.isInteger(entry.apiVersion) || entry.apiVersion < 0)) {
    problems.push(
      `${file}: field "apiVersion" ("${entry.apiVersion}") must be a non-negative integer`,
    )
  }
  if ('meith' in entry && !isValidRange(entry.meith)) {
    problems.push(
      `${file}: field "meith" ("${entry.meith}") is not a parseable version range, e.g. ">=0.16 <1"`,
    )
  }
  if (
    'repository' in entry &&
    (typeof entry.repository !== 'string' || !/^https:\/\//.test(entry.repository))
  ) {
    problems.push(`${file}: field "repository" ("${entry.repository}") must be an https URL`)
  }
  if ('licence' in entry && (typeof entry.licence !== 'string' || entry.licence.trim() === '')) {
    problems.push(`${file}: field "licence" must not be empty`)
  }

  return problems
}

/** Cross-listing checks: nothing here can be seen from one file alone. */
export function checkUniqueness(files) {
  const problems = []
  const byKey = new Map()
  const byPackage = new Map()

  for (const { file, entry } of files) {
    if (typeof entry.key === 'string') {
      const other = byKey.get(entry.key)
      if (other !== undefined)
        problems.push(`${file}: key "${entry.key}" is already used by ${other}`)
      else byKey.set(entry.key, file)
    }
    if (typeof entry.package === 'string') {
      const other = byPackage.get(entry.package)
      if (other !== undefined) {
        problems.push(`${file}: package "${entry.package}" is already listed by ${other}`)
      } else byPackage.set(entry.package, file)
    }
  }

  return problems
}

/**
 * Builds the merged feed from validated entries. Pure and order-independent:
 * entries are sorted by key so the output does not depend on directory
 * listing order, which is what makes the generator deterministic.
 */
export function buildFeed(entries) {
  const listings = [...entries]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => ({
      ...entry,
      screenshots: entry.screenshots.map((name) => `/marketplace/screenshots/${name}`),
    }))

  return { schema: 'https://www.meith.dev/marketplace/v1.json#/schema', listings }
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Reads and validates every listing under `listingsDirAbs`. Returns the
 * structural/semantic problems plus the entries that parsed and validated
 * cleanly enough to check for cross-listing collisions and build the feed.
 */
export async function collectListings(listingsDirAbs) {
  const problems = []
  const names = (await readdir(listingsDirAbs)).filter((name) => extname(name) === '.json').sort()

  const files = []
  for (const name of names) {
    const raw = await readFile(join(listingsDirAbs, name), 'utf8')
    let entry
    try {
      entry = JSON.parse(raw)
    } catch (err) {
      problems.push(`${name}: invalid JSON — ${err.message}`)
      continue
    }
    const entryProblems = validateEntry(name, entry)
    if (entryProblems.length > 0) problems.push(...entryProblems)
    else files.push({ file: name, entry })
  }

  problems.push(...checkUniqueness(files))
  return { problems, files }
}

/** Checks that every screenshot a validated listing names actually exists. */
export async function checkScreenshotsExist(files, screenshotsDirAbs) {
  const problems = []
  for (const { file, entry } of files) {
    for (const shot of entry.screenshots ?? []) {
      const exists = await fileExists(join(screenshotsDirAbs, shot))
      if (!exists) {
        problems.push(
          `${file}: field "screenshots" names "${shot}", which does not exist in the screenshots directory`,
        )
      }
    }
  }
  return problems
}

async function main() {
  const check = process.argv.includes('--check')

  // The schema document itself must at least parse — the generator's own
  // checks are what actually gets enforced (see the file's top comment).
  JSON.parse(await readFile(join(ROOT, SCHEMA_FILE), 'utf8'))

  const listingsDirAbs = join(ROOT, LISTINGS_DIR)
  const names = await readdir(listingsDirAbs).catch(() => [])
  if (names.filter((name) => extname(name) === '.json').length === 0) {
    throw new Error(
      `marketplace-gen: ${LISTINGS_DIR} has no listings — refusing to emit an empty feed`,
    )
  }

  const { problems, files } = await collectListings(listingsDirAbs)
  problems.push(...(await checkScreenshotsExist(files, join(ROOT, SCREENSHOTS_DIR))))

  if (problems.length > 0) {
    console.error(`✗ marketplace: ${problems.length} problem(s) in ${LISTINGS_DIR}\n`)
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('')
    process.exit(1)
  }

  const feed = buildFeed(files.map(({ entry }) => entry))
  const generated = `${JSON.stringify(feed, null, 2)}\n`

  const feedPath = join(ROOT, FEED_FILE)
  const currentFeed = await readFile(feedPath, 'utf8').catch(() => null)

  const screenshotDiffs = []
  for (const { entry } of files) {
    for (const shot of entry.screenshots) {
      const source = await readFile(join(ROOT, SCREENSHOTS_DIR, shot))
      const targetPath = join(ROOT, FEED_SCREENSHOTS_DIR, shot)
      const current = await readFile(targetPath).catch(() => null)
      if (current === null || !current.equals(source)) {
        screenshotDiffs.push({ shot, source, targetPath })
      }
    }
  }

  const feedStale = currentFeed !== generated
  const stale = feedStale || screenshotDiffs.length > 0

  if (check) {
    if (stale) {
      console.error(`${FEED_FILE} or its screenshots are out of date.\n`)
      console.error(
        'The marketplace listings changed and the published feed did not. Run ' +
          '`pnpm marketplace:gen` and commit the result — meith.dev serves this feed at a ' +
          'stable URL, and a stale copy would ship listings nobody reviewed as current.\n',
      )
      if (feedStale) console.error(`  - ${FEED_FILE} does not match the listings`)
      for (const { shot } of screenshotDiffs) {
        console.error(
          `  - ${FEED_SCREENSHOTS_DIR}/${shot} does not match ${SCREENSHOTS_DIR}/${shot}`,
        )
      }
      process.exit(1)
    }
    console.log(
      `✓ marketplace: ${feed.listings.length} listing(s) valid, feed and screenshots up to date`,
    )
    return
  }

  await mkdir(join(ROOT, FEED_SCREENSHOTS_DIR), { recursive: true })
  await writeFile(feedPath, generated, 'utf8')
  for (const { source, targetPath } of screenshotDiffs) {
    await writeFile(targetPath, source)
  }

  console.log(`✓ marketplace: wrote ${FEED_FILE} — ${feed.listings.length} listing(s)`)
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
