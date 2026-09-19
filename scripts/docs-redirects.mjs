#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const manifest = JSON.parse(
  await readFile(join(ROOT, 'apps/web/content/docs.manifest.json'), 'utf8'),
)
const published = new Set(manifest.documents.map((doc) => `/docs/${doc.slug}`))

const config = (await import(pathToFileURL(join(ROOT, 'apps/web/next.config.mjs')).href)).default
const redirects = await config.redirects()

const shadowed = redirects.filter((redirect) => published.has(redirect.source))

if (shadowed.length > 0) {
  console.error('✗ docs redirects: a redirect shadows a published document')
  for (const redirect of shadowed) {
    console.error(
      `  ${redirect.source} → ${redirect.destination}, but ${redirect.source} is a real page`,
    )
  }
  console.error(
    '\nA reader who follows a link to that page is sent somewhere else. Remove the redirect in ' +
      'apps/web/next.config.mjs, or take the document out of apps/web/content/docs.manifest.json.',
  )
  process.exit(1)
}

console.log(
  `✓ docs redirects: ${redirects.length} redirects, none shadow one of ${published.size} published documents`,
)
