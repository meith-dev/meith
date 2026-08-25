#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, normalize, relative } from 'node:path'

import { createSlugger } from '../apps/web/src/markdown/slug'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DOCS = join(ROOT, 'docs')
const MANIFEST = 'apps/web/content/docs.manifest.json'
const CAPABILITIES = 'apps/web/src/content/site.ts'

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const CLOSING_HASHES = /[ \t]+#+$/
const INLINE_LINK = /\[[^\]]*\]\(\s*([^)\s]+?)(?:\s+"[^"]*")?\s*\)/g
const REFERENCE = /^ {0,3}\[[^\]]+\]:[ \t]+(\S+)/gm
const HTML_HREF = /<a\b[^>]*\bhref="([^"]+)"/g
const CODE_SPAN = /`[^`\n]*`/g
const CAPABILITY = /doc:\s*'([^']+)',\s*\n\s*anchor:\s*(?:'([^']+)'|null)/g

export interface DocLink {
  readonly href: string
  readonly line: number
}

export interface Problem {
  readonly source: string
  readonly line: number | null
  readonly href: string
  readonly reason: string
}

async function markdownFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const found: string[] = []

  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await markdownFiles(full, base)))
    else if (entry.name.endsWith('.md')) found.push(relative(base, full))
  }

  return found.sort()
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}

function outsideFences(markdown: string): { number: number; text: string }[] {
  const lines: { number: number; text: string }[] = []
  let fence: string | null = null

  markdown.split('\n').forEach((text, index) => {
    const fenced = FENCE.exec(text)
    if (fenced) {
      const marker = fenced[1] ?? ''
      if (fence === null) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      return
    }
    if (fence === null) lines.push({ number: index + 1, text })
  })

  return lines
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+/g, '')
    .replace(/(^|[\s(])[*_]{1,3}(\S(?:[^*_]*\S)?)[*_]{1,3}(?=[\s).,;:!?]|$)/g, '$1$2')
}

export function headingAnchors(markdown: string): Set<string> {
  const slugger = createSlugger()
  const anchors = new Set<string>()
  let seenContent = false

  for (const line of outsideFences(markdown)) {
    const heading = ATX.exec(line.text)
    if (!heading) {
      if (line.text.trim() !== '') seenContent = true
      continue
    }

    const depth = (heading[1] ?? '').length
    const text = plainText((heading[2] ?? '').replace(CLOSING_HASHES, '')).trim()
    const leading = depth === 1 && !seenContent

    seenContent = true
    if (!leading) anchors.add(slugger(text))
  }

  return anchors
}

export function maskCode(markdown: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ')
  const lines = markdown.split('\n')
  let fence: string | null = null

  const masked = lines.map((text) => {
    const fenced = FENCE.exec(text)
    if (fenced) {
      const marker = fenced[1] ?? ''
      if (fence === null) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      return blank(text)
    }
    return fence === null ? text : blank(text)
  })

  return masked.join('\n').replace(CODE_SPAN, blank)
}

export function documentLinks(markdown: string): DocLink[] {
  const text = maskCode(markdown)
  const found: DocLink[] = []
  const lineOf = (index: number) => text.slice(0, index).split('\n').length

  for (const pattern of [INLINE_LINK, HTML_HREF, REFERENCE]) {
    for (const match of text.matchAll(pattern)) {
      found.push({ href: match[1] ?? '', line: lineOf(match.index) })
    }
  }

  return found.sort((one, two) => one.line - two.line)
}

export function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')
}

export function nearest(anchor: string, anchors: ReadonlySet<string>): string {
  const words = anchor.split('-').filter((word) => word.length > 3)
  const near = [...anchors].filter((candidate) => words.some((word) => candidate.includes(word)))

  if (near.length === 0) return 'Point it at a heading that exists, or drop the anchor.'
  return `Nearest headings: ${near
    .slice(0, 4)
    .map((one) => `#${one}`)
    .join(', ')}.`
}

export interface Docset {
  readonly anchorsByFile: ReadonlyMap<string, ReadonlySet<string>>
  readonly indexAnchors: ReadonlySet<string>
  readonly fileBySlug: ReadonlyMap<string, string>
  readonly docs: string
  readonly root: string
}

export async function checkDocument(file: string, markdown: string, set: Docset) {
  const source = `docs/${file}`
  const problems: Problem[] = []
  const add = (line: number, href: string, reason: string) =>
    problems.push({ source, line, href, reason })

  for (const { href, line } of documentLinks(markdown)) {
    if (href === '' || isExternal(href)) continue

    const [rawPath = '', ...rest] = href.split('#')
    const anchor = rest.join('#')

    if (rawPath === '') {
      const anchors = set.anchorsByFile.get(file) ?? new Set<string>()
      if (!anchors.has(anchor)) {
        add(
          line,
          href,
          `no heading in ${source} slugifies to "${anchor}". ${nearest(anchor, anchors)}`,
        )
      }
      continue
    }

    const target = normalize(dirname(file) === '.' ? rawPath : join(dirname(file), rawPath))

    if (target.startsWith('../')) {
      const fromRoot = target.replace(/^(\.\.\/)+/, '')
      if (!(await exists(join(set.root, fromRoot)))) {
        add(line, href, `${fromRoot} does not exist in the repository.`)
      }
      continue
    }

    if (!(await exists(join(set.docs, target)))) {
      add(line, href, `docs/${target} does not exist.`)
      continue
    }

    if (anchor === '') continue

    if (!target.endsWith('.md')) {
      add(line, href, `docs/${target} is not a document, so "#${anchor}" goes nowhere.`)
      continue
    }

    if (target === 'README.md') {
      if (!set.indexAnchors.has(anchor)) {
        add(
          line,
          href,
          `the site builds docs/README.md from ${MANIFEST}, and no section there has ` +
            `the id "${anchor}". ${nearest(anchor, set.indexAnchors)}`,
        )
      }
      continue
    }

    const anchors = set.anchorsByFile.get(target)
    if (anchors && !anchors.has(anchor)) {
      add(
        line,
        href,
        `no heading in docs/${target} slugifies to "${anchor}". ${nearest(anchor, anchors)}`,
      )
    }
  }

  return problems
}

export function checkCapabilities(source: string, set: Docset): Problem[] {
  const problems: Problem[] = []

  for (const match of source.matchAll(CAPABILITY)) {
    const [, slug = '', anchor] = match
    const file = set.fileBySlug.get(slug)

    if (!file) {
      problems.push({
        source: CAPABILITIES,
        line: null,
        href: `/docs/${slug}`,
        reason: `${MANIFEST} publishes no document with the slug "${slug}".`,
      })
      continue
    }
    if (anchor === undefined) continue

    const anchors = set.anchorsByFile.get(file) ?? new Set<string>()
    if (!anchors.has(anchor)) {
      problems.push({
        source: CAPABILITIES,
        line: null,
        href: `/docs/${slug}#${anchor}`,
        reason: `no heading in docs/${file} slugifies to "${anchor}". ${nearest(anchor, anchors)}`,
      })
    }
  }

  return problems
}

async function main() {
  const files = await markdownFiles(DOCS)
  const anchorsByFile = new Map<string, ReadonlySet<string>>()
  const sources = new Map<string, string>()

  for (const file of files) {
    const markdown = await readFile(join(DOCS, file), 'utf8')
    sources.set(file, markdown)
    anchorsByFile.set(file, headingAnchors(markdown))
  }

  const manifest = JSON.parse(await readFile(join(ROOT, MANIFEST), 'utf8')) as {
    sections: readonly { id: string }[]
    documents: readonly { slug: string; file: string }[]
  }

  const set: Docset = {
    anchorsByFile,
    indexAnchors: new Set(manifest.sections.map((section) => section.id)),
    fileBySlug: new Map(manifest.documents.map((doc) => [doc.slug, doc.file])),
    docs: DOCS,
    root: ROOT,
  }

  const problems: Problem[] = []
  for (const file of files) {
    problems.push(...(await checkDocument(file, sources.get(file) ?? '', set)))
  }
  problems.push(...checkCapabilities(await readFile(join(ROOT, CAPABILITIES), 'utf8'), set))

  if (problems.length > 0) {
    console.error('\n✖ documentation links point at things that are not there.\n')
    for (const problem of problems) {
      const at = problem.line === null ? problem.source : `${problem.source}:${problem.line}`
      console.error(`  - ${at} → ${problem.href}\n      ${problem.reason}\n`)
    }
    console.error(
      '  The site publishes docs/ as written, so every one of these is a link a reader\n' +
        '  clicks and lands nowhere. Fix the link, or write the heading it promises.\n',
    )
    process.exit(1)
  }

  const anchors = [...anchorsByFile.values()].reduce((total, set) => total + set.size, 0)
  console.log(
    `✓ documentation links: ${files.length} documents, ${anchors} headings, ` +
      'every internal link and anchor resolves',
  )
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
