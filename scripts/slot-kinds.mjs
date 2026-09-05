#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.turbo', 'coverage'])

let readSource = (path) => readFile(path, 'utf8')

async function readSlotKinds() {
  const file = join(ROOT, 'packages/theme-kit/src/slots.ts')
  const source = await readFile(file, 'utf8')

  const start = source.indexOf('export const SLOTS = {')
  const end = source.indexOf('} as const satisfies', start)
  if (start === -1 || end === -1) {
    throw new Error(
      'slot-kinds: could not find the SLOTS object in packages/theme-kit/src/slots.ts. ' +
        'If the registry moved or was reshaped, update this parser — do not delete it.',
    )
  }
  const body = source.slice(start, end)

  const kinds = new Map()
  for (const match of body.matchAll(/(\w+):\s*\{\s*kind:\s*'(server|client)'/g)) {
    kinds.set(match[1], match[2])
  }
  return kinds
}

function assertRegistryParsed(kinds) {
  if (kinds.size < 5) {
    throw new Error(
      `slot-kinds: parsed only ${kinds.size} slot(s) from the registry. That is a ` +
        'broken parser, not a small board — refusing to report a clean run.',
    )
  }
}

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(join(dir, e.name), out)
    } else if (e.isFile() && /\.tsx?$/.test(e.name)) {
      out.push(join(dir, e.name))
    }
  }
  return out
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function declaresUseClient(source) {
  let rest = source.replace(/^\uFEFF/, '')
  for (;;) {
    const before = rest
    rest = rest.replace(/^\s+/, '')
    rest = rest.replace(/^\/\/[^\n]*/, '')
    rest = rest.replace(/^\/\*[\s\S]*?\*\//, '')
    if (rest === before) break
  }
  return /^['"]use client['"]\s*;?/.test(rest)
}

function importedBindings(source) {
  const bindings = new Map()
  const importRe = /import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g
  for (const match of source.matchAll(importRe)) {
    const clause = match[1].trim()
    const specifier = match[2]
    if (/^type\s/.test(clause)) continue

    const named = clause.match(/\{([^}]*)\}/)
    if (named) {
      for (const part of named[1].split(',')) {
        const text = part.trim().replace(/^type\s+/, '')
        if (text === '') continue
        const renamed = text.split(/\s+as\s+/)
        const binding = (renamed[1] ?? renamed[0]).trim()
        if (binding !== '') bindings.set(binding, specifier)
      }
    }

    if (!clause.startsWith('{') && !clause.startsWith('*')) {
      const defaultBinding = clause.match(/^(\w+)/)
      if (defaultBinding) bindings.set(defaultBinding[1], specifier)
    }
  }
  return bindings
}

function slotsObject(source) {
  const clean = stripComments(source)
  const key = /\bslots\s*:\s*\{/.exec(clean)
  if (!key) return null

  let depth = 0
  const start = key.index + key[0].length - 1
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return clean.slice(start + 1, i)
    }
  }
  return null
}

function splitTopLevel(body) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of body) {
    if ('{[('.includes(ch)) depth++
    else if ('}])'.includes(ch)) depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

function slotEntries(body) {
  return splitTopLevel(body).map((segment) => {
    const colon = segment.indexOf(':')
    if (colon === -1) return { slot: segment, value: segment }
    return {
      slot: segment.slice(0, colon).trim(),
      value: segment.slice(colon + 1).trim(),
    }
  })
}

const EXTENSIONS = ['', '.tsx', '.ts', '/index.tsx', '/index.ts']

async function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    try {
      return { file: candidate, source: await readSource(candidate) }
    } catch {}
  }
  return null
}

async function checkManifest(file, source, kinds) {
  const rel = relative(ROOT, file)
  const failures = []

  const body = slotsObject(source)
  if (body === null) {
    return [
      `${rel}: calls defineTheme() but has no \`slots: { ... }\` object this checker ` +
        'can read. Write the slot map inline in the manifest — a map assembled ' +
        'elsewhere cannot be checked, and an unchecked theme is how a client ' +
        'component reaches PostBit.',
    ]
  }

  const bindings = importedBindings(source)

  for (const { slot, value } of slotEntries(body)) {
    if (!/^\w+$/.test(slot)) {
      failures.push(
        `${rel}: \`${slot}\` in the slot map is not a plain slot name. Spreads and ` +
          'computed keys make the map unreadable to this check; list slots literally.',
      )
      continue
    }

    const kind = kinds.get(slot)
    if (kind === undefined) {
      failures.push(
        `${rel}: slot "${slot}" is not in the registry ` +
          '(packages/theme-kit/src/slots.ts). A typo here is a region that never renders.',
      )
      continue
    }

    if (!/^\w+$/.test(value)) {
      failures.push(
        `${rel}: slot "${slot}" is filled with \`${value}\`, which is not a bare ` +
          'imported identifier. Import the component and reference it by name, so ' +
          'that the module it lives in — and therefore which side of the ' +
          'server/client boundary it is on — is knowable without running a build.',
      )
      continue
    }

    const specifier = bindings.get(value)
    if (specifier === undefined) {
      failures.push(
        `${rel}: slot "${slot}" uses \`${value}\`, which is not imported in this ` +
          'file. Slot implementations must be imported directly by the manifest.',
      )
      continue
    }

    const resolved = await resolveModule(file, specifier)
    if (resolved === null) {
      failures.push(
        `${rel}: slot "${slot}" imports \`${value}\` from "${specifier}", which does ` +
          'not resolve to a file next to the manifest. Slot components live inside ' +
          'the theme package.',
      )
      continue
    }

    const isClientModule = declaresUseClient(resolved.source)
    const moduleRel = relative(ROOT, resolved.file)

    if (kind === 'server' && isClientModule) {
      failures.push(
        `${rel}: slot "${slot}" is declared \`server\` but ${moduleRel} starts with ` +
          '"use client".\n' +
          '    A server slot ships no JavaScript. As a client component its whole ' +
          'subtree is serialised\n' +
          '    into the page payload and hydrated — for PostBit that is every post ' +
          'on the page. Move\n' +
          '    the interactive part into a child island and keep the slot on the server.',
      )
    }

    if (kind === 'client' && !isClientModule) {
      failures.push(
        `${rel}: slot "${slot}" is declared \`client\` but ${moduleRel} has no ` +
          '"use client" directive.\n' +
          '    It renders once on the server and never becomes interactive, which ' +
          'looks correct in a\n' +
          '    screenshot and does nothing when clicked.',
      )
    }
  }

  return failures
}

async function checkSample(manifestPath, manifestSource, files, kinds) {
  const previous = readSource
  readSource = async (path) => {
    const rel = relative(ROOT, path)
    for (const [name, source] of Object.entries(files)) {
      if (rel === name) return source
    }
    throw new Error(`probe: no in-memory file for ${rel}`)
  }
  try {
    return await checkManifest(join(ROOT, manifestPath), manifestSource, kinds)
  } finally {
    readSource = previous
  }
}

async function probe(kinds) {
  const failures = []
  const MANIFEST = 'themes/probe/src/theme.ts'
  const POST_BIT = 'themes/probe/src/slots/post-bit.tsx'

  const postBitManifest = `
    import { defineTheme } from '@meith/theme-kit'
    import { PostBit } from './slots/post-bit'
    export default defineTheme({ key: 'p', title: 'P', slots: { PostBit } })
  `

  const crossing = await checkSample(
    MANIFEST,
    postBitManifest,
    { [POST_BIT]: "'use client'\nexport function PostBit() {}" },
    kinds,
  )
  if (crossing.length === 0) {
    failures.push(
      'INERT: a server slot filled from a "use client" module was not reported — ' +
        'the exact regression this check exists for.',
    )
  }

  const clean = await checkSample(
    MANIFEST,
    postBitManifest,
    { [POST_BIT]: 'export function PostBit() {}' },
    kinds,
  )
  if (clean.length > 0) {
    failures.push(`TOO BROAD: a legitimate server slot was reported.\n    ${clean.join('\n    ')}`)
  }

  const inertIsland = await checkSample(
    MANIFEST,
    `
      import { defineTheme } from '@meith/theme-kit'
      import { QuickReply } from './slots/quick-reply'
      export default defineTheme({ key: 'p', title: 'P', slots: { QuickReply } })
    `,
    { 'themes/probe/src/slots/quick-reply.tsx': 'export function QuickReply() {}' },
    kinds,
  )
  if (inertIsland.length === 0) {
    failures.push('INERT: a client slot with no "use client" directive was not reported.')
  }

  const unresolvable = await checkSample(
    MANIFEST,
    `
      import { defineTheme } from '@meith/theme-kit'
      import * as parts from './slots'
      export default defineTheme({ key: 'p', title: 'P', slots: { PostBit: parts.PostBit } })
    `,
    {},
    kinds,
  )
  if (unresolvable.length === 0) {
    failures.push(
      'SILENTLY SKIPPING: an unresolvable slot value was not reported. Unparseable ' +
        'must mean failure, or one clever manifest turns the rule off for good.',
    )
  }

  const typo = await checkSample(
    MANIFEST,
    `
      import { defineTheme } from '@meith/theme-kit'
      import { Postbit } from './slots/post-bit'
      export default defineTheme({ key: 'p', title: 'P', slots: { Postbit } })
    `,
    { [POST_BIT]: 'export function Postbit() {}' },
    kinds,
  )
  if (typo.length === 0) {
    failures.push('INERT: a slot name absent from the registry was not reported.')
  }

  if (declaresUseClient("/* 'use client' is what an island needs */\nexport function X() {}")) {
    failures.push('TOO BROAD: "use client" inside a comment was read as a directive.')
  }
  if (!declaresUseClient("// leading comment\n\n'use client'\nexport function X() {}")) {
    failures.push('INERT: a real directive following a comment was not recognised.')
  }

  const afterNested = slotEntries(' Header: { a: 1 } ? A : B, PostBit ').map((e) => e.slot)
  if (!afterNested.includes('PostBit')) {
    failures.push('INERT: a slot listed after a nested object literal was lost by the parser.')
  }

  return failures
}

const kinds = await readSlotKinds()
assertRegistryParsed(kinds)

if (process.argv.includes('--probe')) {
  const failures = await probe(kinds)
  if (failures.length > 0) {
    console.error('\n✖ slot-kinds probe')
    for (const f of failures) console.error(`  ${f}`)
    console.error(`\n${failures.length} probe failure(s).\n`)
    process.exit(1)
  }
  console.log('✓ slot-kinds fires on a crossing, on an inert island, and spares a clean theme')
} else {
  const roots = ['themes', 'packages', 'apps', 'examples'].map((dir) => join(ROOT, dir))
  const files = (await Promise.all(roots.map((dir) => walk(dir)))).flat()

  let manifests = 0
  const failures = []

  for (const file of files) {
    const rel = relative(ROOT, file)
    if (rel.startsWith('packages/theme-kit/')) continue
    if (rel === 'packages/create-meith/src/extension-templates.ts') continue
    if (/\.test\.tsx?$/.test(rel)) continue

    const source = await readFile(file, 'utf8')
    if (!/\bdefineTheme\s*\(/.test(source)) continue

    manifests++
    failures.push(...(await checkManifest(file, source, kinds)))
  }

  if (failures.length > 0) {
    console.error('\n✖ slot server/client boundary')
    for (const f of failures) console.error(`  ${f}`)
    console.error(`\n${failures.length} slot-kind violation(s).\n`)
    process.exit(1)
  }

  if (manifests === 0) {
    console.error(
      '\n✖ slot server/client boundary: no theme manifest found.\n' +
        '  A theme calls defineTheme() in themes/<name>/src. If one exists and this ' +
        'did not\n  find it, the walk or the detection is broken — do not read this as a ' +
        'pass.\n',
    )
    process.exit(1)
  }
  console.log(
    `✓ ${manifests} theme manifest(s): every filled slot matches its declared kind ` +
      `(${kinds.size} slots registered)`,
  )
}
