#!/usr/bin/env node
/**
 * Validates marketplace/listings/*.json against marketplace/schema.json and
 * the rules a JSON Schema cannot express, then emits the merged feed and its
 * screenshots into apps/web's public assets. See docs/marketplace.md.
 */
import { mkdir, open, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { ROOT } from './workspace-packages.mjs'

export const LISTINGS_DIR = 'marketplace/listings'
export const SCHEMA_FILE = 'marketplace/schema.json'
export const SCREENSHOTS_DIR = 'marketplace/screenshots'
export const PUBLIC_MARKETPLACE_DIR = 'apps/web/public/marketplace'
export const FEED_FILE = `${PUBLIC_MARKETPLACE_DIR}/v1.json`
export const FEED_SCREENSHOTS_DIR = `${PUBLIC_MARKETPLACE_DIR}/screenshots`

/**
 * Mirrors KEY_PATTERN in packages/plugin-kit/src/plugin.ts and
 * packages/marketplace/src/schema.ts. A listing key is not a plugin key —
 * it namespaces nothing on its own — but a marketplace author already
 * knows this rule from writing `definePlugin`, and a second rule for the
 * same shape would only be a second thing to get wrong.
 * marketplace-gen.test.ts pins all three copies plus marketplace/schema.json's
 * own `pattern` against each other so the four cannot silently drift apart.
 */
export const KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
export const PACKAGE_PATTERN = /^(@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*$/
export const SCREENSHOT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*\.png$/
export const KINDS = new Set(['plugin', 'theme'])

/**
 * The 8-byte signature every PNG file opens with, regardless of what
 * follows it. checkScreenshotsExist reads this many bytes off disk rather
 * than trusting the `.png` filename a listing already had to pass through
 * SCREENSHOT_NAME_PATTERN.
 */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * A screenshot over this size does not get copied into the site's public
 * assets. Matches the ceiling the screenshot proxy route already applies
 * to a remotely fetched screenshot (apps/community/app/admin/api/marketplace/screenshot/route.ts),
 * so a locally committed one is held to the same bound.
 */
export const MAX_SCREENSHOT_BYTES = 5_000_000

/**
 * Kept in the order marketplace/schema.json declares `required`;
 * marketplace-gen.test.ts asserts the two lists stay equal so the schema
 * document and this generator cannot silently drift apart.
 */
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

/**
 * A comparator is `>=`, `<=`, `>`, `<` or `=` (default `=`) against a version
 * of one to three numeric parts. Comparators separated by spaces are ANDed —
 * enough to write ">=0.16 <1" and nothing more elaborate than that.
 */
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
 * Orders two entries by `key`, by UTF-16 code point rather than
 * `String.localeCompare` — see buildFeed's own doc comment for why.
 */
export function compareKeys(a, b) {
  if (a.key < b.key) return -1
  if (a.key > b.key) return 1
  return 0
}

/**
 * Builds the merged feed from validated entries. Pure and order-independent:
 * entries are sorted by key so the output does not depend on directory
 * listing order, which is what makes the generator deterministic. The sort
 * itself is by UTF-16 code point (compareKeys), not `String.localeCompare`
 * — a bare `localeCompare` call follows the runtime's own `LANG`/ICU
 * collation, which disagrees across machines on `[a-z0-9-]` strings, so a
 * feed generated on one machine would not byte-match one generated on
 * another from the same listings. docs/marketplace.md promises byte-
 * identical output; only a locale-independent comparator can keep that
 * promise across machines rather than only on one.
 */
export function buildFeed(entries) {
  const listings = [...entries].sort(compareKeys).map((entry) => ({
    ...entry,
    screenshots: entry.screenshots.map((name) => `/marketplace/screenshots/${name}`),
  }))

  return { schema: 'https://www.meith.dev/marketplace/v1.json#/schema', listings }
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

/**
 * Checks that every screenshot a validated listing names actually exists,
 * is under MAX_SCREENSHOT_BYTES, and is genuinely a PNG (its first 8 bytes
 * match PNG_SIGNATURE) — a filename ending in ".png" only proves it passed
 * SCREENSHOT_NAME_PATTERN, not that the bytes behind it are one.
 */
export async function checkScreenshotsExist(files, screenshotsDirAbs) {
  const problems = []
  for (const { file, entry } of files) {
    for (const shot of entry.screenshots ?? []) {
      const shotPath = join(screenshotsDirAbs, shot)
      const info = await stat(shotPath).catch(() => null)
      if (info === null) {
        problems.push(
          `${file}: field "screenshots" names "${shot}", which does not exist in the screenshots directory`,
        )
        continue
      }
      if (info.size > MAX_SCREENSHOT_BYTES) {
        problems.push(
          `${file}: screenshot "${shot}" is ${info.size} bytes, over the ${MAX_SCREENSHOT_BYTES} byte ceiling`,
        )
        continue
      }
      const handle = await open(shotPath, 'r')
      const header = Buffer.alloc(PNG_SIGNATURE.length)
      await handle.read(header, 0, header.length, 0)
      await handle.close()
      if (!header.equals(PNG_SIGNATURE)) {
        problems.push(
          `${file}: screenshot "${shot}" is not a PNG file (its signature does not match)`,
        )
      }
    }
  }
  return problems
}

async function listFilesRecursive(dirAbs, prefix = '') {
  const entries = await readdir(dirAbs, { withFileTypes: true }).catch(() => [])
  const files = []
  for (const dirent of entries) {
    const relPath = prefix === '' ? dirent.name : `${prefix}/${dirent.name}`
    if (dirent.isDirectory()) {
      files.push(...(await listFilesRecursive(join(dirAbs, dirent.name), relPath)))
    } else if (dirent.isFile()) {
      files.push(relPath)
    }
  }
  return files
}

/**
 * Screenshots sitting in the source directory that no validated listing
 * references — leftovers from a deleted or renamed listing, or a file a
 * pull request dropped in with no listing behind it.
 */
export async function findOrphanScreenshots(files, screenshotsDirAbs) {
  const referenced = new Set(files.flatMap(({ entry }) => entry.screenshots ?? []))
  const onDisk = await readdir(screenshotsDirAbs).catch(() => [])
  return onDisk.filter((name) => !referenced.has(name)).sort()
}

/**
 * Files under the published marketplace directory the generator did not
 * put there. The feed file and the screenshots the current listings
 * reference are the whole of what this generator produces; anything else
 * under apps/web/public/marketplace/ reaches meith.dev at a stable URL
 * with no listing, and no review, behind it.
 */
export async function findExtraneousPublishedFiles(files, publicMarketplaceDirAbs) {
  const referenced = new Set(files.flatMap(({ entry }) => entry.screenshots ?? []))
  const allowed = new Set(['v1.json', ...[...referenced].map((name) => `screenshots/${name}`)])
  const onDisk = await listFilesRecursive(publicMarketplaceDirAbs)
  return onDisk.filter((relPath) => !allowed.has(relPath)).sort()
}

/**
 * The schema document itself only needs to parse here — the generator's own
 * checks above are what actually gets enforced (see this file's own header).
 */
async function main() {
  const check = process.argv.includes('--check')

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

  const sourceOrphans = await findOrphanScreenshots(files, join(ROOT, SCREENSHOTS_DIR))
  const publishedExtraneous = await findExtraneousPublishedFiles(
    files,
    join(ROOT, PUBLIC_MARKETPLACE_DIR),
  )

  const feedStale = currentFeed !== generated
  const orphaned = sourceOrphans.length > 0 || publishedExtraneous.length > 0
  const stale = feedStale || screenshotDiffs.length > 0 || orphaned

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
      for (const name of sourceOrphans) {
        console.error(
          `  - ${SCREENSHOTS_DIR}/${name} is not referenced by any listing's "screenshots" field`,
        )
      }
      for (const relPath of publishedExtraneous) {
        console.error(
          `  - ${PUBLIC_MARKETPLACE_DIR}/${relPath} was not produced by any current listing`,
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
  for (const name of sourceOrphans) {
    await unlink(join(ROOT, SCREENSHOTS_DIR, name))
  }
  for (const relPath of publishedExtraneous) {
    await unlink(join(ROOT, PUBLIC_MARKETPLACE_DIR, relPath))
  }

  console.log(`✓ marketplace: wrote ${FEED_FILE} — ${feed.listings.length} listing(s)`)
  if (orphaned) {
    for (const name of sourceOrphans) console.log(`  - deleted ${SCREENSHOTS_DIR}/${name}`)
    for (const relPath of publishedExtraneous) {
      console.log(`  - deleted ${PUBLIC_MARKETPLACE_DIR}/${relPath}`)
    }
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
