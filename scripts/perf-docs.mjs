#!/usr/bin/env node
/**
 * F89 — the performance reference, generated from the budgets and the recorded run.
 *
 * Fourth in the family, and the one where "generated" earns the most. The other
 * three references restate a registry; this one restates a *measurement*, and a
 * measurement transcribed by hand is a measurement that stops being true without
 * anybody editing it.
 *
 * Two inputs, and neither is prose:
 *
 *  - `budgets.ts` — the ceilings, which are code the runner enforces.
 *  - `docs/perf-results.json` — what the last recorded run actually observed,
 *    written by `pnpm perf measure --record`.
 *
 * So a number in the document is either a budget the harness checks or a figure
 * a run produced. There is nowhere for a hopeful number to enter.
 *
 * The prose around them lives in this file rather than in the output, for the
 * same reason as the other three: an editable document beside a generated one
 * gets edited, and then regenerated over.
 *
 * Run: pnpm perf:docs   ·   Check: pnpm perf:docs:check
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const BUDGETS_FILE = 'packages/testkit/src/load/budgets.ts'
const RESULTS_FILE = 'docs/perf-results.json'
const OUTPUT_FILE = 'docs/performance.md'

/**
 * Pull the `BUDGETS` array out of the TypeScript source.
 *
 * Text, not an import: these scripts run under plain `node`, and adding a
 * TypeScript loader to the docs pipeline to read ten object literals would be a
 * build step in service of a build step. The shape is pinned by
 * `budgets.test.ts`, so a change that broke this parser breaks a test first.
 */
async function readBudgets() {
  const source = await readFile(join(ROOT, BUDGETS_FILE), 'utf8')
  const start = source.indexOf('export const BUDGETS')
  if (start === -1) throw new Error(`No BUDGETS array in ${BUDGETS_FILE}`)

  /*
   * The `[` after the `=`, not the first one after the declaration — the type
   * annotation is `readonly Budget[]`, whose brackets come first and are empty.
   * The first draft matched those and cheerfully reported zero budgets.
   */
  const assign = source.indexOf('=', start)
  const open = source.indexOf('[', assign)
  if (assign === -1 || open === -1) throw new Error('BUDGETS has no array literal')
  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i++) {
    if (source[i] === '[') depth++
    else if (source[i] === ']' && --depth === 0) {
      end = i
      break
    }
  }
  if (end === -1) throw new Error('Unterminated BUDGETS array')

  const body = source.slice(open + 1, end)
  const budgets = []

  for (const entry of splitObjects(body)) {
    budgets.push({
      id: field(entry, 'id'),
      page: field(entry, 'page'),
      work: field(entry, 'work'),
      p95Ms: Number(field(entry, 'p95Ms', /p95Ms:\s*([\d_]+)/).replace(/_/g, '')),
      kind: field(entry, 'kind'),
      why: field(entry, 'why'),
    })
  }

  return budgets
}

/** Top-level `{ … }` literals, respecting nesting and strings. */
function splitObjects(body) {
  const objects = []
  let depth = 0
  let from = -1
  let quote = null

  for (let i = 0; i < body.length; i++) {
    const char = body[i]

    if (quote !== null) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') {
      if (depth++ === 0) from = i
    } else if (char === '}' && --depth === 0) {
      objects.push(body.slice(from, i + 1))
    }
  }

  return objects
}

/**
 * A field of one object literal.
 *
 * String values may be written as several adjacent literals joined with `+` —
 * prettier breaks a long sentence that way — so the whole run is consumed
 * rather than the first fragment. Reading only the first is how a generated
 * document ends up quoting the opening clause of every explanation.
 */
function field(entry, name, pattern) {
  if (pattern) {
    const match = pattern.exec(entry)
    if (match === null) throw new Error(`Budget entry missing "${name}"`)
    return match[1]
  }

  const at = new RegExp(`\\b${name}:\\s*`).exec(entry)
  if (at === null) throw new Error(`Budget entry missing "${name}": ${entry.slice(0, 60)}…`)
  return joinStringLiterals(entry.slice(at.index + at[0].length))
}

/** Consume `'a' + 'b' + "c"` from the front of a fragment, stopping at the comma. */
function joinStringLiterals(fragment) {
  let out = ''
  let i = 0

  for (;;) {
    while (i < fragment.length && /[\s+]/.test(fragment[i])) i++
    const quote = fragment[i]
    if (quote !== "'" && quote !== '"') break

    i++
    let value = ''
    while (i < fragment.length && fragment[i] !== quote) {
      if (fragment[i] === '\\\\') i++
      value += fragment[i]
      i++
    }
    i++
    out += value
  }

  if (out === '') throw new Error(`Not a string literal: ${fragment.slice(0, 40)}…`)
  return out
}

async function readResults() {
  const raw = await readFile(join(ROOT, RESULTS_FILE), 'utf8').catch(() => null)
  if (raw === null) return null
  return JSON.parse(raw)
}

const ms = (value) => `${value.toFixed(1)} ms`

function render({ budgets, results }) {
  const out = []
  const byId = new Map((results?.results ?? []).map((r) => [r.id, r]))

  out.push('# Performance')
  out.push('')
  out.push('<!--')
  out.push('  GENERATED FILE — do not edit.')
  out.push('')
  out.push(`  Budgets come from ${BUDGETS_FILE}, which the load runner enforces.`)
  out.push(`  Measurements come from ${RESULTS_FILE}, written by \`pnpm perf measure --record\`.`)
  out.push('  Regenerate with `pnpm perf:docs`; `pnpm verify` fails when this is stale.')
  out.push('-->')
  out.push('')
  out.push('The p95 budgets for the pages a forum’s traffic actually goes to, and what')
  out.push('the last recorded run measured against a full-scale board.')
  out.push('')

  /* ---- The run ---- */
  if (results === null) {
    out.push('## No run recorded')
    out.push('')
    out.push('`pnpm perf measure --record` has not been run against a full-scale board.')
    out.push('The budgets below are therefore ceilings nothing has yet been measured against.')
    out.push('')
  } else {
    const env = results.environment ?? {}
    out.push('## The board these numbers came from')
    out.push('')
    out.push('| | |')
    out.push('|---|---|')
    out.push(`| Posts | ${results.postCount.toLocaleString()} |`)
    out.push(`| Threads | ${results.threadCount.toLocaleString()} |`)
    out.push(`| Longest thread | ${results.longestThreadPosts.toLocaleString()} posts |`)
    out.push(`| Iterations | ${results.iterations} per scenario, ${results.warmup} discarded |`)
    out.push(`| Machine | ${env.cpus}× ${env.cpuModel}, ${env.memoryGb} GB |`)
    out.push(`| Runtime | Node ${env.node} on ${env.platform} |`)
    out.push(`| Measured | ${String(results.measuredAt).slice(0, 10)} |`)
    out.push('')
    out.push('The absolute numbers belong to that machine. What travels between machines')
    out.push('is the **shape**: which scenarios sit near their budget, and whether a deep')
    out.push('page costs more than a first page. Compare ratios, not milliseconds.')
    out.push('')
  }

  /* ---- The table ---- */
  out.push('## Budgets and measurements')
  out.push('')
  out.push('| Page | Budget | | Measured p95 | p50 | p99 | Used |')
  out.push('|---|---:|---|---:|---:|---:|---:|')

  for (const budget of budgets) {
    const seen = byId.get(budget.id)
    const used = seen ? `${((seen.p95 / budget.p95Ms) * 100).toFixed(0)}%` : '—'
    out.push(
      `| ${budget.page} | ${budget.p95Ms} ms | ${budget.kind} | ${seen ? ms(seen.p95) : '—'} | ` +
        `${seen ? ms(seen.p50) : '—'} | ${seen ? ms(seen.p99) : '—'} | ${used} |`,
    )
  }

  out.push('')

  const limits = budgets.filter((b) => b.kind === 'limit')
  if (limits.length > 0) {
    out.push('A **target** is a number the page is expected to meet, set with headroom over')
    out.push('what was measured. A **limit** is a number that was measured, is not considered')
    out.push('good, and is recorded anyway so it cannot get worse quietly — a debt with a')
    out.push(
      `number on it, not a pass mark. ${limits.length === 1 ? 'One entry is a limit' : `${limits.length} entries are limits`}:`,
    )
    out.push('')
    for (const limit of limits) out.push(`- **${limit.page}** — ${limit.work}.`)
    out.push('')
  }

  /* ---- Why each one is on the list ---- */
  out.push('## What each scenario is and why it is measured')
  out.push('')

  for (const budget of budgets) {
    out.push(`### ${budget.page}`)
    out.push('')
    out.push(`\`${budget.id}\` — ${budget.work}.`)
    out.push('')
    out.push(budget.why)
    out.push('')
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

const budgets = await readBudgets()
const results = await readResults()
const generated = render({ budgets, results })
const target = join(ROOT, OUTPUT_FILE)

if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '')
  if (current !== generated) {
    console.error(
      `${OUTPUT_FILE} is out of date.\n\nA budget or a recorded run changed and the ` +
        'reference did not. Run `pnpm perf:docs` and commit the result — a published p95 ' +
        'that no run produced is worse than no published p95.\n',
    )
    const a = current.split('\n')
    const b = generated.split('\n')
    const at = a.findIndex((line, i) => line !== b[i])
    console.error(`First difference at line ${at + 1}:`)
    console.error(`  on disk:   ${a[at] ?? '(end of file)'}`)
    console.error(`  generated: ${b[at] ?? '(end of file)'}`)
    process.exit(1)
  }
  console.log(`${OUTPUT_FILE} is up to date (${budgets.length} budgets).`)
} else {
  await writeFile(target, generated, 'utf8')
  console.log(
    `Wrote ${OUTPUT_FILE} — ${budgets.length} budgets, ` +
      `${results === null ? 'no' : results.results.length} measurements.`,
  )
}
