#!/usr/bin/env node
/**
 * F25 — the server/client slot boundary, checked statically.
 *
 * `theme-kit` declares a kind per slot and enforces it two ways already: an
 * `async` client slot does not type-check, and a bundler-marked client reference
 * in a server slot throws at `defineTheme`. Neither catches the case that
 * actually happens:
 *
 *   a plain synchronous component in a file that starts with "use client".
 *
 * It satisfies the server signature, it is an ordinary function under vitest, and
 * it renders identically. The only difference is that its whole subtree now ships
 * to the browser and hydrates. For `PostBit` that is the entire post list — the
 * one number this product is built around.
 *
 * So the check is textual and runs in `pnpm verify`:
 *
 *   1. read the slot kinds out of packages/theme-kit/src/slots.ts;
 *   2. find every theme manifest (a file calling `defineTheme(`);
 *   3. map each filled slot to the module its component was imported from;
 *   4. compare that module's "use client" status against the declared kind.
 *
 * ## It refuses to guess
 *
 * Step 3 is a regex over TypeScript, which is brittle — so the brittleness is
 * converted into an explicit rule rather than a silent pass: if a slot's value is
 * not a bare identifier resolving to a local import, the check **fails**, asking
 * for that form. A checker that shrugs at what it cannot parse is how a boundary
 * erodes — one clever manifest and the rule is off for that theme forever, while
 * still reporting green.
 *
 * Both directions are errors. A client slot implemented by a server module is the
 * quieter bug: the island renders once and never becomes interactive, so a
 * quick-reply box looks right in a screenshot and does nothing when clicked.
 *
 * Run: pnpm slots:check   ·   Probe it: pnpm slots:check --probe
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.turbo',
  'coverage',
])

/*
 * Every file read goes through here so the probe can substitute in-memory
 * sources and still exercise the real analysis. One code path, not two — a probe
 * with its own copy of the logic drifts from the rule it claims to test.
 */
let readSource = (path) => readFile(path, 'utf8')

/* ------------------------------------------------------------------ *
 * The slot registry, read from its single source
 * ------------------------------------------------------------------ */

/**
 * Parse `SLOTS` out of slots.ts.
 *
 * Deliberately *not* imported: this script is plain ESM and slots.ts is
 * TypeScript, so importing it would mean adding a TS loader to a guard — making
 * the guard depend on the toolchain it is guarding. The shape it reads is pinned
 * by packages/theme-kit/src/slots.test.ts, and `assertRegistryParsed` refuses to
 * report a clean run if this parse ever stops finding slots.
 *
 * @returns {Promise<Map<string, 'server'|'client'>>}
 */
async function readSlotKinds() {
  const file = join(ROOT, 'packages/theme-kit/src/slots.ts')
  const source = await readFile(file, 'utf8')

  // Only the SLOTS object literal, so prose in the file header cannot match.
  const start = source.indexOf('export const SLOTS = {')
  const end = source.indexOf('} as const satisfies', start)
  if (start === -1 || end === -1) {
    throw new Error(
      'slot-kinds: could not find the SLOTS object in packages/theme-kit/src/slots.ts. ' +
        'If the registry moved or was reshaped, update this parser — do not delete it.',
    )
  }
  const body = source.slice(start, end)

  /** @type {Map<string, 'server'|'client'>} */
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

/* ------------------------------------------------------------------ *
 * Source analysis
 * ------------------------------------------------------------------ */

/** Recursively collect .ts/.tsx files under a directory. */
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

/** Strip block and line comments. Used before any structural parse. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * `true` when a module declares itself a client module.
 *
 * The directive must be the *first statement*, so only leading whitespace and
 * comments are skipped before looking. A `'use client'` further down the file is
 * not a directive at all — React ignores it — and treating one as such would let
 * a mention in a comment flip a file's apparent kind.
 */
function declaresUseClient(source) {
  // Escaped, not literal: a raw BOM in source is invisible in every diff (R0).
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

/**
 * Map local binding → import specifier for a module's value imports.
 *
 * Covers the forms a manifest legitimately uses: named imports (including
 * `as` renames and inline `type`), and default imports. A namespace import is
 * not resolvable to one component module, so bindings taken from it are absent
 * here and reported by the caller rather than skipped.
 */
function importedBindings(source) {
  /** @type {Map<string, string>} */
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

/**
 * Extract the body of the `slots: { ... }` object.
 *
 * Brace-counted rather than regex-matched: slot values are often calls or
 * objects, and a lazy `\{([^}]*)\}` stops at the first inner `}` and silently
 * loses every slot after it — a checker that quietly stops reading half the map
 * is worse than no checker.
 */
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

/** Split on top-level commas, ignoring those nested in braces/brackets/parens. */
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

/**
 * `{ slot, value }` pairs from a slots object body.
 *
 * Shorthand (`{ PostBit }`) is the idiomatic form and resolves to itself. A
 * spread or a computed key produces an entry whose `slot` is not an identifier,
 * which the caller reports — that is the "assembled elsewhere" case, and it must
 * fail rather than vanish.
 */
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

/* ------------------------------------------------------------------ *
 * Resolution and the check itself
 * ------------------------------------------------------------------ */

const EXTENSIONS = ['', '.tsx', '.ts', '/index.tsx', '/index.ts']

/** Resolve a relative specifier to a file on disk, or `null`. */
async function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    try {
      return { file: candidate, source: await readSource(candidate) }
    } catch {
      /* try the next extension */
    }
  }
  return null
}

/**
 * Check one manifest.
 *
 * @returns {Promise<string[]>} human-readable failures; empty when clean.
 */
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

/* ------------------------------------------------------------------ *
 * Probe (D10: prove the check is not inert)
 * ------------------------------------------------------------------ */

/** Run the real analysis over in-memory sources. */
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

/**
 * Two assertions per case, and the second is the one people forget: a check
 * broadened until everything fails satisfies "fires on a violation" trivially
 * while making the build unfixable.
 */
async function probe(kinds) {
  const failures = []
  const MANIFEST = 'themes/probe/src/theme.ts'
  const POST_BIT = 'themes/probe/src/slots/post-bit.tsx'

  const postBitManifest = `
    import { defineTheme } from '@meith/theme-kit'
    import { PostBit } from './slots/post-bit'
    export default defineTheme({ key: 'p', title: 'P', slots: { PostBit } })
  `

  /* 1. A server slot implemented by a client module must be caught. */
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

  /* 2. The same manifest over a server module must pass. */
  const clean = await checkSample(
    MANIFEST,
    postBitManifest,
    { [POST_BIT]: 'export function PostBit() {}' },
    kinds,
  )
  if (clean.length > 0) {
    failures.push(`TOO BROAD: a legitimate server slot was reported.\n    ${clean.join('\n    ')}`)
  }

  /* 3. A client slot that forgot its directive must be caught. */
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

  /* 4. A slot value this checker cannot resolve must fail, not be skipped. */
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

  /* 5. A slot name that is not in the registry must fail. */
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

  /* 6. The directive parser itself, both ways. */
  if (declaresUseClient("/* 'use client' is what an island needs */\nexport function X() {}")) {
    failures.push('TOO BROAD: "use client" inside a comment was read as a directive.')
  }
  if (!declaresUseClient("// leading comment\n\n'use client'\nexport function X() {}")) {
    failures.push('INERT: a real directive following a comment was not recognised.')
  }

  /* 7. Brace counting: a slot after a nested object must still be seen. */
  const afterNested = slotEntries(" Header: { a: 1 } ? A : B, PostBit ").map((e) => e.slot)
  if (!afterNested.includes('PostBit')) {
    failures.push('INERT: a slot listed after a nested object literal was lost by the parser.')
  }

  return failures
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

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
  const roots = ['themes', 'packages', 'apps'].map((dir) => join(ROOT, dir))
  const files = (await Promise.all(roots.map((dir) => walk(dir)))).flat()

  let manifests = 0
  const failures = []

  for (const file of files) {
    const rel = relative(ROOT, file)
    // theme-kit *declares* defineTheme, and its tests build throwaway manifests.
    if (rel.startsWith('packages/theme-kit/')) continue
    if (/\.test\.tsx?$/.test(rel)) continue

    const source = await readFile(file, 'utf8')
    if (!/\bdefineTheme\s*\(/.test(source)) continue

    manifests++
    failures.push(...(await checkManifest(file, source, kinds)))
  }

  if (failures.length > 0) {
    console.error('\n✖ F25 slot server/client boundary')
    for (const f of failures) console.error(`  ${f}`)
    console.error(`\n${failures.length} slot-kind violation(s).\n`)
    process.exit(1)
  }

  /*
   * A clean run over nothing is the failure mode this whole script is written
   * against: it reported "0 theme manifests, every slot matches" for its first
   * hour of life, which is a green tick for having checked nothing at all.
   */
  if (manifests === 0) {
    console.error(
      '\n✖ F25 slot server/client boundary: no theme manifest found.\n' +
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
