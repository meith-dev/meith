import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import * as siteContent from '../apps/web/src/content/site'
import { slugify } from '../apps/web/src/markdown/slug'
import {
  checkDocReferences,
  checkDocument,
  collectDocReferences,
  type Docset,
  dedupeReferences,
  documentLinks,
  headingAnchors,
  isExternal,
  maskCode,
} from './docs-links.mts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function docset(files: Record<string, string>): Promise<Docset> {
  const root = await mkdtemp(join(tmpdir(), 'docs-links-'))
  directories.push(root)

  const anchorsByFile = new Map<string, ReadonlySet<string>>()
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(root, name), body, 'utf8')
    anchorsByFile.set(name, headingAnchors(body))
  }

  return {
    anchorsByFile,
    indexAnchors: new Set(['install']),
    fileBySlug: new Map([['operating', 'operating.md']]),
    docs: root,
    root,
  }
}

describe('headingAnchors', () => {
  it('slugifies with the site slugifier', () => {
    expect([...headingAnchors('# Title\n\n## Backup and restore\n')]).toEqual([
      slugify('Backup and restore'),
    ])
  })

  it('drops the leading h1, because the site renders it as the page title', () => {
    expect(headingAnchors('# Operations\n\ntext\n').has('operations')).toBe(false)
  })

  it('keeps an h1 that is not the document title', () => {
    expect(headingAnchors('# Title\n\ntext\n\n# Later\n').has('later')).toBe(true)
  })

  it('numbers repeated headings the way the site does', () => {
    expect([...headingAnchors('# T\n\n## Backup\n\n## Backup\n\n## Backup\n')]).toEqual([
      'backup',
      'backup-1',
      'backup-2',
    ])
  })

  it('ignores comments inside fenced code that look like headings', () => {
    const markdown = '# T\n\n```sh\n# Not a heading\n```\n\n## Real\n'
    expect([...headingAnchors(markdown)]).toEqual(['real'])
  })

  it('reads through inline code and emphasis, as the renderer does', () => {
    expect(
      headingAnchors('# T\n\n## What `meith upgrade` does\n').has('what-meith-upgrade-does'),
    ).toBe(true)
  })
})

describe('documentLinks', () => {
  it('finds a link whose text wraps onto the next line', () => {
    const links = documentLinks('# T\n\ntext [Groups a plugin may\ngrant](./operating.md#groups)\n')
    expect(links.map((link) => link.href)).toEqual(['./operating.md#groups'])
  })

  it('reports the line the link starts on', () => {
    const links = documentLinks('# T\n\na\n\n[x](./y.md)\n')
    expect(links[0]?.line).toBe(5)
  })

  it('ignores links inside fenced code blocks', () => {
    expect(documentLinks('# T\n\n```md\n[x](./gone.md)\n```\n')).toEqual([])
  })

  it('ignores a link inside an inline code span', () => {
    expect(documentLinks('# T\n\nWrite `[x](./gone.md)` like this.\n')).toEqual([])
  })

  it('finds reference definitions and html hrefs', () => {
    const links = documentLinks('# T\n\n[ref]: ./a.md#one\n\n<a href="./b.md#two">b</a>\n')
    expect(links.map((link) => link.href).sort()).toEqual(['./a.md#one', './b.md#two'])
  })
})

describe('maskCode', () => {
  it('preserves line numbering while blanking code', () => {
    const masked = maskCode('a\n```\nb\n```\nc\n')
    expect(masked.split('\n').length).toBe(6)
    expect(masked.split('\n')[2]).toBe(' ')
  })
})

describe('isExternal', () => {
  it('recognises schemes and protocol-relative urls', () => {
    expect(isExternal('https://example.com')).toBe(true)
    expect(isExternal('mailto:a@b.c')).toBe(true)
    expect(isExternal('//example.com')).toBe(true)
    expect(isExternal('./operating.md')).toBe(false)
  })
})

describe('checkDocument', () => {
  it('passes a link whose anchor is a real heading', async () => {
    const set = await docset({
      'a.md': '# A\n\n[go](./operating.md#backup)\n',
      'operating.md': '# Operations\n\n## Backup\n',
    })
    expect(await checkDocument('a.md', '# A\n\n[go](./operating.md#backup)\n', set)).toEqual([])
  })

  it('catches an anchor no heading slugifies to', async () => {
    const markdown = '# A\n\n[go](./operating.md#backup-and-restore)\n'
    const set = await docset({ 'a.md': markdown, 'operating.md': '# Operations\n\n## Backup\n' })
    const [problem] = await checkDocument('a.md', markdown, set)

    expect(problem?.source).toBe('docs/a.md')
    expect(problem?.line).toBe(3)
    expect(problem?.href).toBe('./operating.md#backup-and-restore')
    expect(problem?.reason).toContain('no heading in docs/operating.md')
    expect(problem?.reason).toContain('#backup')
  })

  it('catches a link to a file that does not exist', async () => {
    const markdown = '# A\n\n[go](./missing.md)\n'
    const set = await docset({ 'a.md': markdown })
    const [problem] = await checkDocument('a.md', markdown, set)

    expect(problem?.reason).toContain('docs/missing.md does not exist')
  })

  it('catches a same-document anchor that is not there', async () => {
    const markdown = '# A\n\n## One\n\n[go](#two)\n'
    const set = await docset({ 'a.md': markdown })
    const [problem] = await checkDocument('a.md', markdown, set)

    expect(problem?.reason).toContain('no heading in docs/a.md')
  })

  it('accepts a same-document anchor that is there', async () => {
    const markdown = '# A\n\n## One\n\n[go](#one)\n'
    const set = await docset({ 'a.md': markdown })
    expect(await checkDocument('a.md', markdown, set)).toEqual([])
  })

  it('checks README anchors against the manifest sections the site renders', async () => {
    const markdown = '# A\n\n[go](./README.md#nope)\n'
    const set = await docset({ 'a.md': markdown, 'README.md': '# Index\n\n## Nope\n' })
    const [problem] = await checkDocument('a.md', markdown, set)

    expect(problem?.reason).toContain('no section')
  })

  it('catches a link that escapes docs/ and hits nothing', async () => {
    const markdown = '# A\n\n[go](../nowhere/file.ts)\n'
    const set = await docset({ 'a.md': markdown })
    const [problem] = await checkDocument('a.md', markdown, set)

    expect(problem?.reason).toContain('does not exist in the repository')
  })

  it('reports an anchor into a document the scan missed, rather than skipping it', async () => {
    const markdown = '# A\n\n[go](./operating.md#backup)\n'
    const set = await docset({ 'a.md': markdown, 'operating.md': '# Operations\n\n## Backup\n' })
    const partial: Docset = {
      ...set,
      anchorsByFile: new Map([['a.md', set.anchorsByFile.get('a.md') ?? new Set<string>()]]),
    }
    const [problem] = await checkDocument('a.md', markdown, partial)

    expect(problem?.reason).toContain('was not scanned')
  })

  it('leaves external links alone', async () => {
    const markdown = '# A\n\n[go](https://example.com/x#y)\n'
    const set = await docset({ 'a.md': markdown })
    expect(await checkDocument('a.md', markdown, set)).toEqual([])
  })
})

describe('collectDocReferences', () => {
  it('finds a doc reference wherever it sits in the content graph', () => {
    const content = {
      capabilities: [{ doc: 'operating', anchor: 'backup' }],
      footer: { links: [{ label: 'Upgrades', doc: 'upgrading' }] },
    }

    expect(collectDocReferences(content)).toEqual([
      { doc: 'operating', anchor: 'backup', path: 'site.capabilities[0]' },
      { doc: 'upgrading', anchor: null, path: 'site.footer.links[0]' },
    ])
  })

  it('does not care what order the fields are written in', () => {
    const reordered = { capabilities: [{ anchor: 'backup', link: 'x', doc: 'operating' }] }
    expect(collectDocReferences(reordered)[0]).toEqual({
      doc: 'operating',
      anchor: 'backup',
      path: 'site.capabilities[0]',
    })
  })

  it('treats a missing anchor as no anchor', () => {
    expect(collectDocReferences({ links: [{ doc: 'quickstart' }] })[0]?.anchor).toBe(null)
  })
})

describe('dedupeReferences', () => {
  it('collapses the synthesized default namespace against the named exports', () => {
    const references = collectDocReferences({
      capabilities: [{ doc: 'operating', anchor: null }],
      default: { capabilities: [{ doc: 'operating', anchor: null }] },
    })

    expect(references).toHaveLength(2)
    expect(dedupeReferences(references)).toHaveLength(1)
  })

  it('reports paths that exist in the source, not the synthesized default namespace', () => {
    const references = dedupeReferences(collectDocReferences(siteContent))
    expect(references.every((reference) => !reference.path.startsWith('site.default.'))).toBe(true)
  })

  it('finds every doc reference the site content carries', () => {
    expect(dedupeReferences(collectDocReferences(siteContent))).toHaveLength(13)
  })

  it('keeps two genuinely different places that name the same document', () => {
    const references = collectDocReferences({
      header: { links: [{ doc: 'operating' }] },
      footer: { links: [{ doc: 'operating' }] },
    })

    expect(dedupeReferences(references)).toHaveLength(2)
  })
})

describe('checkDocReferences', () => {
  it('catches an anchor with no heading behind it', async () => {
    const set = await docset({ 'operating.md': '# Operations\n\n## Backup\n' })
    const [problem] = checkDocReferences(
      [{ doc: 'operating', anchor: 'permissions', path: 'site.capabilities[0]' }],
      set,
    )

    expect(problem?.href).toBe('/docs/operating#permissions')
    expect(problem?.source).toContain('site.capabilities[0]')
    expect(problem?.reason).toContain('no heading in docs/operating.md')
  })

  it('accepts an anchor that resolves', async () => {
    const set = await docset({ 'operating.md': '# Operations\n\n## Backup\n' })
    expect(checkDocReferences([{ doc: 'operating', anchor: 'backup', path: 'site' }], set)).toEqual(
      [],
    )
  })

  it('catches a reference to an unpublished slug, anchor or not', async () => {
    const set = await docset({ 'operating.md': '# Operations\n' })
    const [problem] = checkDocReferences([{ doc: 'ghost', anchor: null, path: 'site' }], set)

    expect(problem?.reason).toContain('publishes no document with the slug "ghost"')
  })
})
