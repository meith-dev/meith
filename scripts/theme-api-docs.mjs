#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const SLOTS_FILE = 'packages/theme-kit/src/slots.ts'
const API_FILE = 'packages/theme-kit/src/api.ts'
const MODELS_FILE = 'packages/theme-kit/src/view-models.ts'
const OUTPUT_FILE = 'docs/theme-slots.md'

function balancedBlock(source, from) {
  const start = source.indexOf('{', from)
  if (start === -1) return null

  let depth = 0
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { body: source.slice(start + 1, i), end: i }
    }
  }
  return null
}

function balancedList(source, from) {
  const start = source.indexOf('[', from)
  if (start === -1) return null

  let depth = 0
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return source.slice(start + 1, i)
    }
  }
  return null
}

function depthDelta(line) {
  let delta = 0
  for (const ch of line) {
    if ('{[('.includes(ch)) delta++
    else if ('}])'.includes(ch)) delta--
  }
  return delta
}

function joinStringLiterals(fragment) {
  let out = ''
  for (let i = 0; i < fragment.length; i++) {
    if (fragment[i] !== "'") continue
    i++
    for (; i < fragment.length && fragment[i] !== "'"; i++) {
      if (fragment[i] === '\\') i++
      out += fragment[i]
    }
  }
  return out
}

function flattenDoc(lines) {
  return lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripDocMarkers(line) {
  return line
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .replace(/^\s*\*\s?/, '')
    .trim()
}

function cell(text) {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

async function readSlots() {
  const source = await readFile(join(ROOT, SLOTS_FILE), 'utf8')
  const start = source.indexOf('export const SLOTS = {')
  const end = source.indexOf('} as const satisfies', start)
  if (start === -1 || end === -1) {
    throw new Error(
      `theme-api-docs: could not find the SLOTS object in ${SLOTS_FILE}. If the ` +
        'registry moved or was reshaped, update this parser — do not delete it.',
    )
  }

  const body = source.slice(source.indexOf('{', start) + 1, end)
  const slots = []

  const entryRe = /(?:^|\n)\s{2}(\w+):\s*\{/g
  for (const match of body.matchAll(entryRe)) {
    const block = balancedBlock(body, match.index + match[0].length - 1)
    if (block === null) continue

    const kind = /kind:\s*'(server|client)'/.exec(block.body)
    const feature = /feature:\s*'([^']+)'/.exec(block.body)
    const purposeAt = block.body.indexOf('purpose:')

    if (kind === null || feature === null || purposeAt === -1) {
      throw new Error(
        `theme-api-docs: slot "${match[1]}" is missing kind, feature or purpose — ` +
          'or this parser can no longer read them.',
      )
    }

    const purpose = joinStringLiterals(block.body.slice(purposeAt))
    if (purpose === '') {
      throw new Error(`theme-api-docs: slot "${match[1]}" has an unreadable purpose.`)
    }

    slots.push({ name: match[1], kind: kind[1], feature: feature[1], purpose })
  }

  if (slots.length < 5) {
    throw new Error(
      `theme-api-docs: parsed only ${slots.length} slot(s). That is a broken parser, ` +
        'not a small board — refusing to write a document that would look complete.',
    )
  }
  return slots
}

async function readFreeze(slotNames) {
  const source = await readFile(join(ROOT, API_FILE), 'utf8')

  const version = /export const THEME_API_VERSION = '([^']+)'/.exec(source)
  if (version === null) throw new Error('theme-api-docs: no THEME_API_VERSION in api.ts.')

  const mapAt = source.indexOf('export const SLOT_STABILITY')
  const map = balancedBlock(source, mapAt)
  if (mapAt === -1 || map === null) {
    throw new Error('theme-api-docs: could not read SLOT_STABILITY from api.ts.')
  }

  const stability = new Map()
  for (const entry of map.body.matchAll(/(\w+):\s*'(stable|provisional|deprecated)'/g)) {
    stability.set(entry[1], entry[2])
  }

  for (const name of slotNames) {
    if (!stability.has(name)) {
      throw new Error(`theme-api-docs: slot "${name}" has no entry in SLOT_STABILITY.`)
    }
  }
  for (const name of stability.keys()) {
    if (!slotNames.includes(name)) {
      throw new Error(`theme-api-docs: SLOT_STABILITY classifies "${name}", which is not a slot.`)
    }
  }

  const listAt = source.indexOf('export const DEPRECATIONS')
  const listBody = balancedList(source, listAt)
  if (listAt === -1 || listBody === null) {
    throw new Error('theme-api-docs: could not read DEPRECATIONS from api.ts.')
  }

  const deprecations = []
  let cursor = 0
  for (;;) {
    const entry = balancedBlock(listBody, cursor)
    if (entry === null) break

    const field = (key) => {
      const match = new RegExp(`${key}:\\s*(?:'([^']*)'|null)`).exec(entry.body)
      if (match === null) {
        throw new Error(
          `theme-api-docs: a DEPRECATIONS entry has no readable "${key}". Entries must be ` +
            'object literals with string or null values — this document is a promise ' +
            'about removals and cannot be written from a parse that guessed.',
        )
      }
      return match[1] ?? null
    }

    deprecations.push({
      kind: field('kind'),
      name: field('name'),
      since: field('since'),
      removeIn: field('removeIn'),
      replacement: field('replacement'),
      reason: field('reason'),
    })
    cursor = entry.end + 1
  }

  return { version: version[1], stability, deprecations }
}

function parseMembers(interfaceName, body) {
  const members = []
  let doc = []
  let inDoc = false
  let inComment = false
  let buffer = null
  let depth = 0

  for (const raw of body.split('\n')) {
    const line = raw.trim()

    if (buffer === null) {
      if (inDoc) {
        doc.push(stripDocMarkers(line))
        if (line.endsWith('*/')) inDoc = false
        continue
      }
      if (inComment) {
        if (line.endsWith('*/')) inComment = false
        continue
      }
      if (line.startsWith('/**')) {
        doc = [stripDocMarkers(line)]
        inDoc = !line.endsWith('*/')
        continue
      }
      if (line.startsWith('/*')) {
        inComment = !line.endsWith('*/')
        doc = []
        continue
      }
      if (line === '' || line.startsWith('//')) continue

      buffer = line
      depth = depthDelta(line)
    } else {
      buffer += ` ${line}`
      depth += depthDelta(line)
    }

    if (depth !== 0) continue

    const member = /^(?:readonly\s+)?(\w+)(\?)?:\s*(.+?);?$/.exec(buffer.replace(/\s+/g, ' '))
    if (member === null) {
      throw new Error(
        `theme-api-docs: cannot read member "${buffer}" of ${interfaceName}. Members must ` +
          'be `readonly name: Type` — a shape this cannot parse would be silently ' +
          'missing from the reference.',
      )
    }

    members.push({
      name: member[1],
      optional: member[2] === '?',
      type: member[3].trim(),
      doc: flattenDoc(doc),
    })
    buffer = null
    doc = []
  }

  if (buffer !== null) {
    throw new Error(`theme-api-docs: unterminated member "${buffer}" in ${interfaceName}.`)
  }
  return members
}

async function readModels() {
  const source = await readFile(join(ROOT, MODELS_FILE), 'utf8')

  const models = new Map()

  const interfaceRe = /export interface (\w+)(?:\s+extends\s+([\w.]+))?\s*\{/g
  for (const match of source.matchAll(interfaceRe)) {
    const block = balancedBlock(source, match.index + match[0].length - 1)
    if (block === null) continue

    const before = source.slice(0, match.index).trimEnd()
    let doc = ''
    if (before.endsWith('*/')) {
      const open = before.lastIndexOf('/**')
      if (open !== -1) {
        doc = flattenDoc(before.slice(open).split('\n').map(stripDocMarkers))
      }
    }

    models.set(match[1], {
      name: match[1],
      extends: match[2] ?? null,
      members: parseMembers(match[1], block.body),
      doc,
    })
  }

  const mapAt = source.indexOf('export interface SlotModels')
  const map = balancedBlock(source, mapAt)
  if (mapAt === -1 || map === null) {
    throw new Error('theme-api-docs: could not read SlotModels from view-models.ts.')
  }

  const slotModels = new Map()
  for (const entry of map.body.matchAll(/(\w+):\s*(\w+)/g)) {
    slotModels.set(entry[1], entry[2])
  }

  if (models.size < 10 || slotModels.size < 10) {
    throw new Error(
      `theme-api-docs: parsed ${models.size} model(s) and ${slotModels.size} slot mapping(s). ` +
        'Refusing to write a document from that.',
    )
  }
  return { models, slotModels }
}

function fieldsOf(models, name) {
  const model = models.get(name)
  if (model === undefined) return []
  const inherited =
    model.extends === null
      ? []
      : fieldsOf(models, model.extends).map((field) => ({ ...field, from: model.extends }))
  return [...inherited, ...model.members.map((member) => ({ ...member, from: null }))]
}

function referencedModels(models, type) {
  return [...type.matchAll(/\b([A-Z]\w*)\b/g)]
    .map((match) => match[1])
    .filter((name) => models.has(name))
}

function renderFieldTable(models, name) {
  const fields = fieldsOf(models, name)
  if (fields.length === 0) return '_No fields._\n'

  const rows = fields.map((field) => {
    const notes = [
      field.from === null ? '' : `from \`${field.from}\``,
      field.optional ? 'optional' : '',
      field.doc,
    ]
      .filter((part) => part !== '')
      .join(' — ')
    return `| \`${field.name}\` | \`${cell(field.type)}\` | ${cell(notes)} |`
  })

  return ['| Field | Type | Notes |', '|---|---|---|', ...rows, ''].join('\n')
}

function render({ slots, freeze, models, slotModels }) {
  const counts = { stable: 0, provisional: 0, deprecated: 0 }
  for (const slot of slots) counts[freeze.stability.get(slot.name)]++

  const out = []
  const push = (...lines) => out.push(...lines)

  push(
    '# Theme slots and view models',
    '',
    '<!--',
    '  GENERATED FILE — do not edit.',
    '',
    '  Written by scripts/theme-api-docs.mjs from packages/theme-kit/src/{slots,api,',
    '  view-models}.ts. Run `pnpm theme:docs` after changing any of them; `pnpm verify`',
    '  and CI run `pnpm theme:docs:check` and fail when this file and the code disagree.',
    '-->',
    '',
    `**theme-kit v${freeze.version}.** ${slots.length} slots: ${counts.stable} stable, ` +
      `${counts.provisional} provisional, ${counts.deprecated} deprecated.`,
    '',
    'What the marks mean, and how something is removed, is in',
    '[`theme-api.md`](./theme-api.md). In short: a **stable** slot and the fields of its',
    'model do not change before the next major; a **provisional** slot is named but not yet rendered',
    'by any page, so its model may change in a minor release; a **deprecated** slot still',
    'works and has a removal scheduled below.',
    '',
    '## Every slot',
    '',
    '| Slot | Kind | Stability | Props |',
    '|---|---|---|---|',
  )

  for (const slot of slots) {
    const model = slotModels.get(slot.name) ?? '—'
    push(
      `| [\`${slot.name}\`](#${slot.name.toLowerCase()}) | \`${slot.kind}\` | ` +
        `${freeze.stability.get(slot.name)} | \`${model}\` |`,
    )
  }

  push('', '## Slot reference', '')

  const shared = new Set()
  for (const slot of slots) {
    const modelName = slotModels.get(slot.name)
    push(
      `### ${slot.name}`,
      '',
      `\`${slot.kind}\` · ${freeze.stability.get(slot.name)}`,
      '',
      slot.purpose,
      '',
    )

    if (modelName === undefined) {
      push('_No model._', '')
      continue
    }

    push(`Props: \`${modelName}\``, '', renderFieldTable(models, modelName))

    for (const field of fieldsOf(models, modelName)) {
      for (const referenced of referencedModels(models, field.type)) shared.add(referenced)
    }
  }

  const slotModelNames = new Set(slotModels.values())
  for (;;) {
    const before = shared.size
    for (const name of [...shared]) {
      for (const field of fieldsOf(models, name)) {
        for (const referenced of referencedModels(models, field.type)) shared.add(referenced)
      }
      const base = models.get(name)?.extends
      if (base !== null && base !== undefined && models.has(base)) shared.add(base)
    }
    if (shared.size === before) break
  }
  for (const name of slotModelNames) shared.delete(name)

  push('## Shared models', '')
  push(
    'Referenced by the models above. Same promise: a field of a shared model reached',
    'from a stable slot is stable.',
    '',
  )
  for (const name of [...shared].sort()) {
    push(`### ${name}`, '')
    const doc = models.get(name)?.doc ?? ''
    if (doc !== '') push(doc, '')
    push(renderFieldTable(models, name))
  }

  push('## Scheduled removals', '')
  if (freeze.deprecations.length === 0) {
    push(
      `Nothing is deprecated in v${freeze.version}. Nothing can be: this is the first`,
      'frozen contract, so there is no earlier promise to withdraw.',
      '',
    )
  } else {
    push('| What | Deprecated in | Removed in | Replacement | Reason |', '|---|---|---|---|---|')
    for (const entry of freeze.deprecations) {
      push(
        `| \`${entry.name}\` (${entry.kind}) | ${entry.since} | ${entry.removeIn} | ` +
          `${entry.replacement === null ? '—' : `\`${entry.replacement}\``} | ${cell(entry.reason)} |`,
      )
    }
    push('')
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

const slots = await readSlots()
const freeze = await readFreeze(slots.map((slot) => slot.name))
const { models, slotModels } = await readModels()

for (const slot of slots) {
  if (!slotModels.has(slot.name)) {
    throw new Error(`theme-api-docs: slot "${slot.name}" has no entry in SlotModels.`)
  }
}

const generated = render({ slots, freeze, models, slotModels })
const target = join(ROOT, OUTPUT_FILE)

if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '')

  if (current !== generated) {
    console.error(
      `${OUTPUT_FILE} is out of date.\n\n` +
        'The theme contract changed and its reference did not. Run `pnpm theme:docs` and ' +
        'commit the result — a theme author reads that file instead of the source, and a ' +
        'stale one describes fields that no longer exist.\n',
    )
    if (current === '') {
      console.error('(The file does not exist yet.)')
    } else {
      const a = current.split('\n')
      const b = generated.split('\n')
      const at = a.findIndex((line, i) => line !== b[i])
      console.error(`First difference at line ${at + 1}:`)
      console.error(`  on disk:   ${a[at] ?? '(end of file)'}`)
      console.error(`  generated: ${b[at] ?? '(end of file)'}`)
    }
    process.exit(1)
  }

  console.log(`${OUTPUT_FILE} is up to date (${slots.length} slots, ${models.size} models).`)
} else {
  await writeFile(target, generated, 'utf8')
  console.log(`Wrote ${OUTPUT_FILE} — ${slots.length} slots, ${models.size} models.`)
}
