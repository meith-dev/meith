import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { KEY_PATTERN as MARKETPLACE_PKG_KEY_PATTERN } from '../packages/marketplace/src/schema'
import { KEY_PATTERN as PLUGIN_KIT_KEY_PATTERN } from '../packages/plugin-kit/src/plugin'
import {
  buildFeed,
  checkScreenshotsExist,
  checkUniqueness,
  collectListings,
  compareKeys,
  findExtraneousPublishedFiles,
  findOrphanScreenshots,
  isValidRange,
  KEY_PATTERN,
  KINDS,
  MAX_SCREENSHOT_BYTES,
  PNG_SIGNATURE,
  REQUIRED_FIELDS,
  SCREENSHOT_NAME_PATTERN,
  VERSION_PATTERN,
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

describe('compareKeys', () => {
  it('orders by UTF-16 code point', () => {
    expect(compareKeys({ key: 'aaa' }, { key: 'zzz' })).toBeLessThan(0)
    expect(compareKeys({ key: 'zzz' }, { key: 'aaa' })).toBeGreaterThan(0)
    expect(compareKeys({ key: 'aaa' }, { key: 'aaa' })).toBe(0)
  })

  it(
    "disagrees with String.localeCompare's own default collation on a real pair (MEI-94) — " +
      'proof that a bare localeCompare call would not have byte-matched across machines',
    () => {
      expect('a_b'.localeCompare('a-b')).toBeLessThan(0)
      expect(compareKeys({ key: 'a_b' }, { key: 'a-b' })).toBeGreaterThan(0)
    },
  )

  it(
    'disagrees with a real named locale collation too — Danish groups a doubled "aa" near ' +
      '"å", after "z", which reverses this pair relative to code-point order',
    () => {
      expect('aaa'.localeCompare('aba', 'da-DK')).toBeGreaterThan(0)
      expect(compareKeys({ key: 'aaa' }, { key: 'aba' })).toBeLessThan(0)
    },
  )
})

describe('marketplace/schema.json stays in step with the generator', () => {
  it('declares exactly REQUIRED_FIELDS, no more and no less', async () => {
    const schema = JSON.parse(await readFile(join(ROOT, 'marketplace/schema.json'), 'utf8'))
    expect([...schema.required].sort()).toEqual([...REQUIRED_FIELDS].sort())
    expect(Object.keys(schema.properties).sort()).toEqual([...REQUIRED_FIELDS].sort())
    expect(schema.additionalProperties).toBe(false)
  })

  it(
    'declares the same patterns, enum and minimum this generator enforces, not just the ' +
      'same field names (MEI-94)',
    async () => {
      const schema = JSON.parse(await readFile(join(ROOT, 'marketplace/schema.json'), 'utf8'))
      expect(schema.properties.key.pattern).toBe(KEY_PATTERN.source)
      expect(schema.properties.kind.enum).toEqual([...KINDS])
      expect(schema.properties.screenshots.items.pattern).toBe(SCREENSHOT_NAME_PATTERN.source)
      expect(schema.properties.version.pattern).toBe(VERSION_PATTERN.source)
      expect(schema.properties.apiVersion.minimum).toBe(0)
      expect(schema.properties.repository.pattern).toBe('^https://')
    },
  )

  it(
    'agrees with packages/marketplace and definePlugin on the key pattern itself, all four ' +
      'copies pinned against one another (MEI-94)',
    async () => {
      const schema = JSON.parse(await readFile(join(ROOT, 'marketplace/schema.json'), 'utf8'))
      expect(KEY_PATTERN.source).toBe(schema.properties.key.pattern)
      expect(KEY_PATTERN.source).toBe(MARKETPLACE_PKG_KEY_PATTERN.source)
      expect(KEY_PATTERN.source).toBe(PLUGIN_KIT_KEY_PATTERN.source)
    },
  )
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

  it('leaves no orphan screenshot and no extraneous published file behind (MEI-94)', async () => {
    const { files } = await collectListings(join(ROOT, 'marketplace/listings'))

    const sourceOrphans = await findOrphanScreenshots(files, join(ROOT, 'marketplace/screenshots'))
    expect(sourceOrphans).toEqual([])

    const publishedExtraneous = await findExtraneousPublishedFiles(
      files,
      join(ROOT, 'apps/web/public/marketplace'),
    )
    expect(publishedExtraneous).toEqual([])
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

describe('checkScreenshotsExist against screenshot content, not just the filename', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('rejects a file named *.png whose bytes are not a PNG (MEI-94)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'marketplace-gen-'))
    await writeFile(join(dir, 'dues-light.png'), 'not actually a png')

    const files = [{ file: 'dues.json', entry: { screenshots: ['dues-light.png'] } }]
    const problems = await checkScreenshotsExist(files, dir)

    expect(problems).toEqual([
      'dues.json: screenshot "dues-light.png" is not a PNG file (its signature does not match)',
    ])
  })

  it('rejects a real PNG over MAX_SCREENSHOT_BYTES (MEI-94)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'marketplace-gen-'))
    const oversized = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(MAX_SCREENSHOT_BYTES)])
    await writeFile(join(dir, 'dues-light.png'), oversized)

    const files = [{ file: 'dues.json', entry: { screenshots: ['dues-light.png'] } }]
    const problems = await checkScreenshotsExist(files, dir)

    expect(problems).toEqual([
      `dues.json: screenshot "dues-light.png" is ${oversized.length} bytes, over the ` +
        `${MAX_SCREENSHOT_BYTES} byte ceiling`,
    ])
  })

  it('accepts a real PNG under the ceiling', async () => {
    dir = await mkdtemp(join(tmpdir(), 'marketplace-gen-'))
    await writeFile(join(dir, 'dues-light.png'), PNG_SIGNATURE)

    const files = [{ file: 'dues.json', entry: { screenshots: ['dues-light.png'] } }]
    expect(await checkScreenshotsExist(files, dir)).toEqual([])
  })
})

describe('findOrphanScreenshots and findExtraneousPublishedFiles (MEI-94)', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('names a screenshot no listing references', async () => {
    dir = await mkdtemp(join(tmpdir(), 'marketplace-gen-'))
    await writeFile(join(dir, 'dues-light.png'), PNG_SIGNATURE)
    await writeFile(join(dir, 'leftover-light.png'), PNG_SIGNATURE)

    const files = [{ file: 'dues.json', entry: { screenshots: ['dues-light.png'] } }]
    expect(await findOrphanScreenshots(files, dir)).toEqual(['leftover-light.png'])
  })

  it('reports no orphan once every file on disk is referenced', async () => {
    dir = await mkdtemp(join(tmpdir(), 'marketplace-gen-'))
    await writeFile(join(dir, 'dues-light.png'), PNG_SIGNATURE)

    const files = [{ file: 'dues.json', entry: { screenshots: ['dues-light.png'] } }]
    expect(await findOrphanScreenshots(files, dir)).toEqual([])
  })

  it(
    'names a published file no current listing produced, including one dropped straight ' +
      'into the published directory rather than added as a reviewed listing',
    async () => {
      dir = await mkdtemp(join(tmpdir(), 'marketplace-gen-'))
      await mkdir(join(dir, 'screenshots'), { recursive: true })
      await writeFile(join(dir, 'v1.json'), '{}')
      await writeFile(join(dir, 'screenshots', 'dues-light.png'), PNG_SIGNATURE)
      await writeFile(join(dir, 'screenshots', 'smuggled.png'), 'anything')
      await writeFile(join(dir, 'anything.json'), '{}')

      const files = [{ file: 'dues.json', entry: { screenshots: ['dues-light.png'] } }]
      const extraneous = await findExtraneousPublishedFiles(files, dir)

      expect(extraneous.sort()).toEqual(['anything.json', 'screenshots/smuggled.png'])
    },
  )
})
