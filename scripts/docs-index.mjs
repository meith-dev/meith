#!/usr/bin/env node
/**
 * F88 — the documentation index, checked rather than generated.
 *
 * The three generated references (theme slots, plugin hooks, REST routes) are
 * written by a script because their content *is* a registry. This one is
 * different: `docs/README.md` is prose — it says which document a particular
 * reader wants, and no script can derive that. So the file is hand-written and
 * what is machine-checked is the property that actually rots: **every document
 * in `docs/` is reachable from the index, and every link in the index resolves.**
 *
 * That is the whole check, and it is worth having because the failure mode is
 * silent in both directions. A document added without an index entry is a
 * document nobody finds — and it is precisely the *new* document, the one most
 * likely to matter, that goes missing. A link left behind by a rename is worse
 * still: it tells a reader the thing exists and then 404s them.
 *
 * Run: pnpm docs:index:check
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DOCS = join(ROOT, 'docs')
const INDEX = 'docs/README.md'

/** Every Markdown file under docs/, recursively, relative to docs/. */
async function markdownFiles(dir = DOCS) {
  const entries = await readdir(dir, { withFileTypes: true })
  const found = []

  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await markdownFiles(full)))
    else if (entry.name.endsWith('.md')) found.push(relative(DOCS, full))
  }

  return found.sort()
}

/**
 * Relative link targets in the index, normalised to a docs-relative path.
 *
 * Anchors (`#running-a-board`) and absolute URLs are not file references and
 * are skipped — the check is about files, and an anchor that goes nowhere is a
 * different (and much less costly) mistake than a missing document.
 */
function linkedPaths(markdown) {
  const targets = new Set()

  for (const match of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = match[1]
    if (href.startsWith('#') || /^[a-z]+:/i.test(href)) continue

    const path = href.split('#')[0].replace(/^\.\//, '')
    if (path !== '') targets.add(path)
  }

  return targets
}

const index = await readFile(join(ROOT, INDEX), 'utf8')
const linked = linkedPaths(index)
const files = await markdownFiles()

/* A directory link (`./adr`) covers itself, not the files inside it. */
const unlisted = files.filter((file) => file !== 'README.md' && !linked.has(file))

const dangling = []
for (const target of linked) {
  const isDirectory = !target.endsWith('.md')
  if (isDirectory) {
    const exists = await readdir(join(DOCS, target)).then(
      () => true,
      () => false,
    )
    if (!exists) dangling.push(target)
    continue
  }
  if (!files.includes(target)) dangling.push(target)
}

if (unlisted.length > 0 || dangling.length > 0) {
  console.error(`${INDEX} is out of date.\n`)

  if (unlisted.length > 0) {
    console.error('These documents exist and nothing in the index links to them:')
    for (const file of unlisted) console.error(`  docs/${file}`)
    console.error(
      '\nAdd each to the right section of the index. A document nobody can find is a ' +
        'document nobody reads, and the newest one is the likeliest to matter.\n',
    )
  }

  if (dangling.length > 0) {
    console.error('The index links to these, and they do not exist:')
    for (const target of dangling) console.error(`  docs/${target}`)
    console.error(
      '\nUsually a rename. A dead link is worse than a missing entry — it tells a ' +
        'reader the document exists.\n',
    )
  }

  process.exit(1)
}

console.log(`${INDEX} is complete — ${files.length - 1} documents, all linked.`)
