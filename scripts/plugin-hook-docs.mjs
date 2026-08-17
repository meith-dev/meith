#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { emitGeneratedDoc } from './generated-doc.mjs'
import { scanCallSites } from './hook-callsites.mjs'
import { balancedBlock, flattenTypeLiteral, joinStringLiterals } from './source-parse.mjs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const HOOKS_FILE = 'packages/plugin-kit/src/hooks.ts'
const PAYLOADS_FILE = 'packages/plugin-kit/src/payloads.ts'
const REGIONS_FILE = 'packages/plugin-kit/src/regions.ts'
const OUTPUT_FILE = 'docs/plugin-hooks.md'

function cell(text) {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

async function readHooks() {
  const source = await readFile(join(ROOT, HOOKS_FILE), 'utf8')
  const start = source.indexOf('export const HOOKS = {')
  const end = source.indexOf('} as const satisfies', start)
  if (start === -1 || end === -1) {
    throw new Error(
      `plugin-hook-docs: could not find the HOOKS object in ${HOOKS_FILE}. If the ` +
        'registry moved or was reshaped, update this parser — do not delete it.',
    )
  }

  const body = source.slice(source.indexOf('{', start) + 1, end)
  const hooks = []
  let group = 'Other'

  const tokenRe = /\/\*\s*----\s*(.+?)\s*----\s*\*\/|(?:^|\n)\s{2}'([\w.-]+)':\s*\{/g
  for (const match of body.matchAll(tokenRe)) {
    if (match[1] !== undefined) {
      group = match[1]
      continue
    }

    const block = balancedBlock(body, match.index + match[0].length - 1)
    if (block === null) continue

    const kind = /kind:\s*'(filter|event)'/.exec(block.body)
    const purposeAt = block.body.indexOf('purpose:')

    if (kind === null || purposeAt === -1) {
      throw new Error(
        `plugin-hook-docs: hook "${match[2]}" is missing kind or purpose — ` +
          'or this parser can no longer read them.',
      )
    }

    const purpose = joinStringLiterals(block.body.slice(purposeAt))
    if (purpose === '') {
      throw new Error(`plugin-hook-docs: hook "${match[2]}" has an unreadable purpose.`)
    }

    hooks.push({ name: match[2], kind: kind[1], purpose, group })
  }

  if (hooks.length < 60) {
    throw new Error(
      `plugin-hook-docs: parsed only ${hooks.length} hook(s). The registry declares more ` +
        'than sixty — refusing to write a reference that would look complete.',
    )
  }
  return hooks
}

async function readSignatures() {
  const source = await readFile(join(ROOT, PAYLOADS_FILE), 'utf8')
  const at = source.indexOf('export interface HookSignatures')
  const block = balancedBlock(source, at)
  if (at === -1 || block === null) {
    throw new Error('plugin-hook-docs: could not read HookSignatures from payloads.ts.')
  }

  const signatures = new Map()
  const entryRe = /(?:^|\n)\s{2}'([\w.-]+)':\s*\{/g
  for (const match of block.body.matchAll(entryRe)) {
    const entry = balancedBlock(block.body, match.index + match[0].length - 1)
    if (entry === null) continue

    const text = flattenTypeLiteral(entry.body)
    const valueAt = text.indexOf('value:')
    const contextAt = text.indexOf('context:')
    if (valueAt === -1 || contextAt === -1) {
      throw new Error(
        `plugin-hook-docs: signature for "${match[1]}" has no readable value/context pair. ` +
          'Every hook is documented as { value, context }; a shape this cannot parse ' +
          'would be missing from the reference.',
      )
    }

    const [first, second] =
      valueAt < contextAt
        ? [text.slice(valueAt + 6, contextAt), text.slice(contextAt + 8)]
        : [text.slice(valueAt + 6), text.slice(contextAt + 8, valueAt)]

    signatures.set(match[1], {
      value: first.replace(/[;\s]+$/, '').trim(),
      context: second.replace(/[;\s]+$/, '').trim(),
    })
  }
  return signatures
}

async function readRegions() {
  const source = await readFile(join(ROOT, REGIONS_FILE), 'utf8')
  const at = source.indexOf('export const PLUGIN_REGIONS = {')
  const end = source.indexOf('} as const satisfies', at)
  if (at === -1 || end === -1) {
    throw new Error('plugin-hook-docs: could not read PLUGIN_REGIONS from regions.ts.')
  }

  const body = source.slice(source.indexOf('{', at) + 1, end)
  const regions = []
  for (const match of body.matchAll(/(?:^|\n)\s{2}'([\w.-]+)':\s*\{/g)) {
    const block = balancedBlock(body, match.index + match[0].length - 1)
    if (block === null) continue

    const purposeAt = block.body.indexOf('purpose:')
    const contextAt = block.body.indexOf('context:')
    if (purposeAt === -1 || contextAt === -1) {
      throw new Error(`plugin-hook-docs: region "${match[1]}" is missing purpose or context.`)
    }

    regions.push({
      name: match[1],
      purpose: joinStringLiterals(block.body.slice(purposeAt, contextAt)),
      context: joinStringLiterals(block.body.slice(contextAt)),
    })
  }

  if (regions.length === 0) throw new Error('plugin-hook-docs: parsed no UI regions.')
  return regions
}

function render({ hooks, signatures, regions, wired }) {
  const filters = hooks.filter((hook) => hook.kind === 'filter').length
  const out = []
  const push = (...lines) => out.push(...lines)

  push(
    '# Plugin hooks',
    '',
    '<!--',
    '  GENERATED FILE — do not edit.',
    '',
    '  Written by scripts/plugin-hook-docs.mjs from packages/plugin-kit/src/{hooks,',
    '  payloads,regions}.ts. Run `pnpm plugin:docs` after changing any of them; `pnpm',
    '  verify` and CI run `pnpm plugin:docs:check` and fail when this file and the code',
    '  disagree.',
    '-->',
    '',
    `**${hooks.length} hooks** — ${filters} filters, ${hooks.length - filters} events — and ` +
      `${regions.length} UI regions. **${wired.size} are wired**: something in the board fires`,
    'them today, and the rest are declared but not yet reached by a call site.',
    '',
    'The wired column is derived from the tree by `scripts/hook-callsites.mjs`, not',
    'maintained by hand — a registry entry with no call site is a promise about code',
    'that never runs, and it fails in the quietest possible way: the plugin installs,',
    'the handler registers, nothing happens. `plugins/reference` is required by its own',
    'test to handle every wired hook, so a hook cannot join that column without',
    'something proving it fires.',
    '',
    'A **filter** is handed a value and returns a replacement; its result is used, so a',
    'filter that throws or returns nothing leaves the value as it was and the chain',
    'carries on with the next plugin. An **event** is told what happened and its return',
    'value is discarded — which is why anything that only wants to observe should be one:',
    'it cannot corrupt the thing it is watching even when it is wrong.',
    '',
    'Handlers run in **(priority, plugin key)** order. Both halves are declared, so two',
    'plugins compose the same way on every request and on every instance.',
    '',
    'Every handler is called inside the host’s try/catch and is timed. A plugin that',
    'fails repeatedly is switched off for the rest of the process and says so in its',
    'health row. See [`plugin-api.md`](./plugin-api.md) for the policy, the lifecycle and',
    'the limits.',
    '',
  )

  const groups = [...new Set(hooks.map((hook) => hook.group))]
  for (const group of groups) {
    push(`## ${group}`, '')
    push('| Hook | Kind | Wired | Value | Context |', '|---|---|---|---|---|')
    for (const hook of hooks.filter((entry) => entry.group === group)) {
      const signature = signatures.get(hook.name)
      if (signature === undefined) {
        throw new Error(`plugin-hook-docs: hook "${hook.name}" has no entry in HookSignatures.`)
      }
      push(
        `| \`${hook.name}\` | ${hook.kind} | ${wired.has(hook.name) ? 'yes' : '—'} | ` +
          `\`${cell(signature.value)}\` | \`${cell(signature.context)}\` |`,
      )
    }
    push('')
    for (const hook of hooks.filter((entry) => entry.group === group)) {
      push(`- **\`${hook.name}\`** — ${hook.purpose}`)
    }
    push('')
  }

  push(
    '## UI regions',
    '',
    'Regions are **not** theme slots. A theme owns its slots; a region is an explicit',
    '"plugins may add something here" point that a theme chooses to render, so the theme',
    'keeps control of where plugin output appears and the plugin keeps control of what it',
    'is. Several plugins contributing to one region compose by concatenation, in the same',
    'deterministic order as hooks.',
    '',
    '| Region | What it is handed |',
    '|---|---|',
  )
  for (const region of regions) {
    push(`| \`${region.name}\` | ${cell(region.context)} |`)
  }
  push('')
  for (const region of regions) {
    push(`- **\`${region.name}\`** — ${region.purpose}`)
  }
  push('')

  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}

const hooks = await readHooks()
const signatures = await readSignatures()
const regions = await readRegions()

const { wired, problems: callSiteProblems } = await scanCallSites()
if (callSiteProblems.length > 0) {
  throw new Error(`plugin-hook-docs: ${callSiteProblems.join('; ')}`)
}

for (const name of signatures.keys()) {
  if (!hooks.some((hook) => hook.name === name)) {
    throw new Error(`plugin-hook-docs: HookSignatures documents "${name}", which is not a hook.`)
  }
}

const generated = render({ hooks, signatures, regions, wired })
await emitGeneratedDoc({
  outputFile: OUTPUT_FILE,
  generated,
  staleReason:
    'The hook registry changed and its reference did not. Run `pnpm plugin:docs` and ' +
    'commit the result — a plugin author reads that file instead of the source, and a ' +
    'stale one names hooks that no longer fire.',
  upToDate: `${hooks.length} hooks, ${wired.size} wired, ${regions.length} regions`,
  wrote: `${hooks.length} hooks, ${wired.size} wired, ${regions.length} regions`,
})
