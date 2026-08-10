#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DOCS = join(ROOT, 'docs')
const INDEX = 'docs/README.md'

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
