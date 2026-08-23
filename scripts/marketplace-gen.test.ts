import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildFeed,
  checkScreenshotsExist,
  checkUniqueness,
  collectListings,
  isValidRange,
  REQUIRED_FIELDS,
  validateEntry,
} from './marketplace-gen.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const VALID_ENTRY = {
  key: 'dues',
  kind: 'plugin',
  package: '@meith/plugin-dues',
  name: 'Dues',
  description: 'Paid memberships through Stripe.',
  screenshots: ['dues-light.png'],
  version: '0.16.0',
  apiVersion: 0,
  meith: '>=0.16 <1',
  repository: 'https://github.com/meith-dev/meith',
  licence: 'LGPL-3.0-or-later',
}

describe('validateEntry', () => {
  it('accepts a well-formed listing', () => {
    expect(validateEntry('dues.json', VALID_ENTRY)).toEqual([])
  })

  it('names the file and field for a bad semver version', () => {
    const problems = validateEntry('dues.json', { ...VALID_ENTRY, version: '1.0' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('dues.json')
    expect(problems[0]).toContain('field "version"')
  })

  it('names the file and field for a wrong kind', () => {
    const problems = validateEntry('dues.json', { ...VALID_ENTRY, kind: 'extension' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('dues.json')
    expect(problems[0]).toContain('field "kind"')
  })

  it('rejects a key that would not pass definePlugin either', () => {
    const problems = validateEntry('dues.json', { ...VALID_ENTRY, key: 'Dues_Plugin' })
    expect(problems[0]).toContain('field "key"')
  })

  it('rejects an unparseable meith range', () => {
    const problems = validateEntry('dues.json', { ...VALID_ENTRY, meith: 'whatever' })
    expect(problems[0]).toContain('field "meith"')
  })

  it('rejects a non-integer apiVersion', () => {
    const problems = validateEntry('dues.json', { ...VALID_ENTRY, apiVersion: 1.5 })
    expect(problems[0]).toContain('field "apiVersion"')
  })

  it('rejects a repository that is not https', () => {
    const problems = validateEntry('dues.json', {
      ...VALID_ENTRY,
      repository: 'http://github.com/meith-dev/meith',
    })
    expect(problems[0]).toContain('field "repository"')
  })

  it('rejects an empty screenshots array', () => {
    const problems = validateEntry('dues.json', { ...VALID_ENTRY, screenshots: [] })
    expect(problems[0]).toContain('field "screenshots"')
  })

  it('reports a missing required field by name', () => {
    const { description, ...rest } = VALID_ENTRY
    const problems = validateEntry('dues.json', rest)
    expect(problems).toContain('dues.json: missing field "description"')
  })

  it('refuses a field outside the fixed schema', () => {
    const problems = validateEntry('dues.json', {
      ...VALID_ENTRY,
      homepage: 'https://dues.example',
    })
    expect(problems[0]).toContain('field "homepage"')
    expect(problems[0]).toContain('maintainer sign-off')
  })
})

describe('isValidRange', () => {
  it.each(['>=0.16 <1', '=1.2.3', '1', '>1.0 <=2.5.0'])('accepts %s', (range) => {
    expect(isValidRange(range)).toBe(true)
  })

  it.each(['', 'latest', '>=1.0 ||', '^1.0.0'])('rejects %s', (range) => {
    expect(isValidRange(range)).toBe(false)
  })
})

describe('checkUniqueness', () => {
  it('flags a repeated key across two files', () => {
    const problems = checkUniqueness([
      { file: 'a.json', entry: { key: 'dues', package: '@meith/plugin-dues' } },
      { file: 'b.json', entry: { key: 'dues', package: '@meith/plugin-dues-2' } },
    ])
    expect(problems).toEqual(['b.json: key "dues" is already used by a.json'])
  })

  it('flags a repeated package across two files', () => {
    const problems = checkUniqueness([
      { file: 'a.json', entry: { key: 'one', package: '@meith/plugin-dues' } },
      { file: 'b.json', entry: { key: 'two', package: '@meith/plugin-dues' } },
    ])
    expect(problems).toEqual(['b.json: package "@meith/plugin-dues" is already listed by a.json'])
  })
})

describe('buildFeed', () => {
  it('is deterministic regardless of input order', () => {
    const a = { ...VALID_ENTRY, key: 'aaa', screenshots: ['aaa.png'] }
    const b = { ...VALID_ENTRY, key: 'zzz', screenshots: ['zzz.png'] }

    const first = JSON.stringify(buildFeed([a, b]))
    const second = JSON.stringify(buildFeed([b, a]))

    expect(first).toBe(second)
  })

  it('sorts listings by key and rewrites screenshots to the public path', () => {
    const feed = buildFeed([
      { ...VALID_ENTRY, key: 'zzz', screenshots: ['zzz.png'] },
      { ...VALID_ENTRY, key: 'aaa', screenshots: ['aaa.png'] },
    ])

    expect(feed.listings.map((entry) => entry.key)).toEqual(['aaa', 'zzz'])
    expect(feed.listings[0].screenshots).toEqual(['/marketplace/screenshots/aaa.png'])
  })

  it('does not mutate the input entries', () => {
    const entry = { ...VALID_ENTRY, screenshots: ['dues-light.png'] }
    buildFeed([entry])
    expect(entry.screenshots).toEqual(['dues-light.png'])
  })
})

describe('marketplace/schema.json stays in step with the generator', () => {
  it('declares exactly REQUIRED_FIELDS, no more and no less', async () => {
    const schema = JSON.parse(await readFile(join(ROOT, 'marketplace/schema.json'), 'utf8'))
    expect([...schema.required].sort()).toEqual([...REQUIRED_FIELDS].sort())
    expect(Object.keys(schema.properties).sort()).toEqual([...REQUIRED_FIELDS].sort())
    expect(schema.additionalProperties).toBe(false)
  })
})

describe('the real marketplace listings', () => {
  it('all validate, are unique, and have their screenshots on disk', async () => {
    const { problems, files } = await collectListings(join(ROOT, 'marketplace/listings'))
    expect(problems).toEqual([])
    expect(files.length).toBeGreaterThanOrEqual(6)

    const screenshotProblems = await checkScreenshotsExist(
      files,
      join(ROOT, 'marketplace/screenshots'),
    )
    expect(screenshotProblems).toEqual([])
  })
})

describe('collectListings and checkScreenshotsExist against a temp fixture', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('fails pnpm verify style — naming the file and field — on a bad semver, and flags a missing screenshot', async () => {
    dir = await mkdtemp(join(tmpdir(), 'marketplace-gen-'))
    const listingsDir = join(dir, 'listings')
    const screenshotsDir = join(dir, 'screenshots')
    await mkdir(listingsDir, { recursive: true })
    await mkdir(screenshotsDir, { recursive: true })

    await writeFile(
      join(listingsDir, 'broken.json'),
      JSON.stringify({ ...VALID_ENTRY, key: 'broken', version: 'not-a-version' }),
    )
    await writeFile(
      join(listingsDir, 'ghost.json'),
      JSON.stringify({ ...VALID_ENTRY, key: 'ghost', screenshots: ['missing.png'] }),
    )
    // 'ghost''s own screenshot is deliberately never written to screenshotsDir.

    const { problems, files } = await collectListings(listingsDir)
    expect(problems).toEqual([
      'broken.json: field "version" ("not-a-version") must be semver (major.minor.patch) — the listed package\'s own version, not the repository release version',
    ])

    const screenshotProblems = await checkScreenshotsExist(files, screenshotsDir)
    expect(screenshotProblems).toEqual([
      'ghost.json: field "screenshots" names "missing.png", which does not exist in the screenshots directory',
    ])
  })
})
