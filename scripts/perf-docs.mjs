#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { emitGeneratedDoc } from './generated-doc.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const BUDGETS_FILE = 'packages/testkit/src/load/budgets.ts'
const RESULTS_FILE = 'docs/reference/perf-results.json'
const INDEX_FILE = 'docs/reference/perf-indexes.json'
const PLANS_FILE = 'packages/testkit/src/load/index-plans.ts'
const COHORTS_FILE = 'packages/testkit/src/load/cohorts.ts'
const LOAD_FILE = 'docs/reference/perf-load.json'
const OUTPUT_FILE = 'docs/reference/performance.md'

function arrayLiteral(source, name, file) {
  const start = source.indexOf(`export const ${name}`)
  if (start === -1) throw new Error(`No ${name} array in ${file}`)

  const assign = source.indexOf('=', start)
  const open = source.indexOf('[', assign)
  if (assign === -1 || open === -1) throw new Error(`${name} has no array literal`)

  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '[') depth++
    else if (source[i] === ']' && --depth === 0) return splitObjects(source.slice(open + 1, i))
  }

  throw new Error(`Unterminated ${name} array`)
}

function number(entry, name) {
  return Number(field(entry, name, new RegExp(`\\b${name}:\\s*([\\d_]+)`)).replace(/_/g, ''))
}

async function readBudgets() {
  const source = await readFile(join(ROOT, BUDGETS_FILE), 'utf8')

  return arrayLiteral(source, 'BUDGETS', BUDGETS_FILE).map((entry) => ({
    id: field(entry, 'id'),
    page: field(entry, 'page'),
    work: field(entry, 'work'),
    p95Ms: number(entry, 'p95Ms'),
    kind: field(entry, 'kind'),
    why: field(entry, 'why'),
  }))
}

async function readCohorts() {
  const source = await readFile(join(ROOT, COHORTS_FILE), 'utf8')

  const cohorts = arrayLiteral(source, 'COHORTS', COHORTS_FILE).map((entry) => ({
    id: field(entry, 'id'),
    members: number(entry, 'members'),
    p95Ms: number(entry, 'p95Ms'),
    kind: field(entry, 'kind'),
    why: field(entry, 'why'),
  }))

  const mix = arrayLiteral(source, 'TRAFFIC_MIX', COHORTS_FILE).map((entry) => ({
    id: field(entry, 'id'),
    share: number(entry, 'share'),
    filtered: /filtered:\s*true/.test(entry),
  }))

  return { cohorts, mix }
}

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

async function readJson(file) {
  const raw = await readFile(join(ROOT, file), 'utf8').catch(() => null)
  return raw === null ? null : JSON.parse(raw)
}

async function readPlans() {
  const source = await readFile(join(ROOT, PLANS_FILE), 'utf8')

  return arrayLiteral(source, 'INDEX_PLANS', PLANS_FILE).map((entry) => ({
    id: field(entry, 'id'),
    page: field(entry, 'page'),
    index: field(entry, 'index'),
    why: field(entry, 'why'),
  }))
}

const ms = (value) => `${value.toFixed(1)} ms`

function flatRange(cohorts, seen) {
  const measured = cohorts
    .map((cohort) => ({ cohort, result: seen.get(cohort.id) }))
    .filter((row) => row.result !== undefined)

  const first = measured[0]
  if (first === undefined) return null

  const ceiling = first.result.summary.p95 * 1.5
  let last = first
  for (const row of measured) {
    if (row.result.summary.p95 > ceiling) break
    last = row
  }

  if (last.cohort.members <= first.cohort.members) return null

  return {
    from: first.cohort,
    to: last.cohort,
    fromP95: first.result.summary.p95,
    toP95: last.result.summary.p95,
  }
}

function renderLoad({ budgets, cohorts, mix, load }) {
  const out = []
  const page = new Map(budgets.map((budget) => [budget.id, budget.page]))
  const seen = new Map((load?.results ?? []).map((result) => [result.id, result]))

  out.push('## Under concurrent load')
  out.push('')

  if (load === null) {
    out.push('`pnpm perf load --record` has not been run against a full-scale board, so')
    out.push('every number below is a ceiling nothing has been measured against yet.')
    out.push('')
    return out
  }

  const think = (load.thinkMs / 1_000).toFixed(0)

  out.push(
    `Fixed-schedule traffic: one page per member every ${think} seconds, using ${load.poolMax} database connections.`,
  )
  out.push('')
  out.push(
    'Late p95 measures the delay before a scheduled request starts. Fixed arrivals expose queueing that a response-then-sleep loop would hide.',
  )
  out.push('')

  out.push('| Active members | Offered | Served | Budget | | p50 | p95 | p99 | Late p95 |')
  out.push('|---:|---:|---:|---:|---|---:|---:|---:|---:|')

  for (const cohort of cohorts) {
    const result = seen.get(cohort.id)
    const rps = (value) => `${value.toFixed(0)}/s`
    out.push(
      `| ${cohort.members.toLocaleString()} | ` +
        `${result ? rps(result.offeredRps) : '—'} | ${result ? rps(result.achievedRps) : '—'} | ` +
        `${cohort.p95Ms} ms | ${cohort.kind} | ${result ? ms(result.summary.p50) : '—'} | ` +
        `${result ? ms(result.summary.p95) : '—'} | ${result ? ms(result.summary.p99) : '—'} | ` +
        `${result ? ms(result.lateness.p95) : '—'} |`,
    )
  }

  out.push('')
  out.push(
    `Each rung discards its first ${(load.settleMs / 1_000).toFixed(0)} seconds, then measures ` +
      `until it has both ${load.minRequests} requests and a steady window to put them in.`,
  )
  out.push('')
  out.push('## Per-page load results')
  out.push('')

  const flat = flatRange(cohorts, seen)
  if (flat !== null) {
    const rise = (flat.to.members / flat.from.members).toFixed(0)
    out.push(
      `Mixed p95: ${ms(flat.fromP95)} at ${flat.from.members.toLocaleString()} members to ${ms(flat.toP95)} at ${flat.to.members.toLocaleString()} members (${rise}× traffic). The traffic mix affects this aggregate; inspect per-page timings too.`,
    )
    out.push('')
  }

  out.push('Per-page p95 by active-member count:')
  out.push('')

  out.push(`| Page | Share | ${cohorts.map((c) => c.members.toLocaleString()).join(' | ')} |`)
  out.push(`|---|---:|${cohorts.map(() => '---:').join('|')}|`)

  for (const entry of mix) {
    const cells = cohorts.map((cohort) => {
      const found = seen.get(cohort.id)?.perScenario.find((scenario) => scenario.id === entry.id)
      return found ? ms(found.summary.p95) : '—'
    })
    out.push(`| ${page.get(entry.id) ?? entry.id} | ${entry.share}% | ${cells.join(' | ')} |`)
  }

  out.push('')
  const filtered = mix.filter((entry) => entry.filtered)
  if (filtered.length > 0) {
    out.push(
      `Scoped reads (${filtered.map((entry) => page.get(entry.id) ?? entry.id).join(', ')}) include permission filtering. They are not directly comparable to single-read timings.`,
    )
    out.push('')
  }

  const limit = cohorts.find((cohort) => cohort.kind === 'limit')
  if (limit !== undefined) {
    out.push(`### ${limit.members.toLocaleString()} active members`)
    out.push('')
    out.push(limit.why)
    out.push('')
  }

  return out
}

function render({ budgets, cohorts, mix, load, results, indexes, plans }) {
  const out = []
  const byId = new Map((results?.results ?? []).map((r) => [r.id, r]))

  out.push('# Performance')
  out.push('')
  out.push('<!--')
  out.push('  GENERATED FILE — do not edit.')
  out.push('')
  out.push(`  Budgets come from ${BUDGETS_FILE}, which the load runner enforces.`)
  out.push(`  Measurements come from ${RESULTS_FILE}, written by \`pnpm perf measure --record\`.`)
  out.push(`  Cohorts and the traffic mix come from ${COHORTS_FILE}.`)
  out.push(`  The load run comes from ${LOAD_FILE}, written by \`pnpm perf load --record\`.`)
  out.push('  Regenerate with `pnpm perf:docs`; `pnpm verify` fails when this is stale.')
  out.push('-->')
  out.push('')
  out.push(
    'Recorded database-read timings, budgets and concurrent-load results. These are single-process measurements with an in-process cache and no Redis. Measure your own deployment; shared-cache results can differ.',
  )
  out.push('')

  if (results === null) {
    out.push('## No run recorded')
    out.push('')
    out.push('`pnpm perf measure --record` has not been run against a full-scale board.')
    out.push('The budgets below are therefore ceilings nothing has yet been measured against.')
    out.push('')
  } else {
    const env = results.environment ?? {}
    out.push('## Test environment')
    out.push('')
    out.push('| | |')
    out.push('|---|---|')
    out.push(`| Posts | ${results.postCount.toLocaleString()} |`)
    out.push(`| Threads | ${results.threadCount.toLocaleString()} |`)
    out.push(`| Longest thread | ${results.longestThreadPosts.toLocaleString()} posts |`)
    if (Array.isArray(results.visibility)) {
      out.push(
        `| Visibility | ${results.visibility
          .map((v) => `${v.posts.toLocaleString()} ${v.visibility}`)
          .join(', ')} |`,
      )
    }
    out.push(`| Iterations | ${results.iterations} per scenario, ${results.warmup} discarded |`)
    out.push(`| Machine | ${env.cpus}× ${env.cpuModel}, ${env.memoryGb} GB |`)
    out.push(`| Runtime | Node ${env.node} on ${env.platform} |`)
    out.push(`| Measured | ${String(results.measuredAt).slice(0, 10)} |`)
    out.push('')
    out.push(
      'Results apply to the recorded machine and workload; they are not a capacity guarantee.',
    )
    out.push('')
  }

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
    out.push(
      'A target is the expected ceiling. A limit records an existing slow path to detect regressions; meeting it does not resolve that performance issue.',
    )
    out.push('')
    for (const limit of limits) out.push(`- **${limit.page}** — ${limit.work}.`)
    out.push('')
  }

  out.push(...renderLoad({ budgets, cohorts, mix, load }))

  out.push('## Partial visible indexes')
  out.push('')
  out.push('`pnpm perf explain` checks that the planner uses the expected indexes.')
  out.push('')

  const seen = new Map((indexes?.results ?? []).map((r) => [r.id, r]))
  out.push('| Page | Index | Used | Warm |')
  out.push('|---|---|---|---:|')
  for (const plan of plans) {
    const result = seen.get(plan.id)
    out.push(
      `| ${plan.page} | \`${plan.index}\` | ${result ? (result.used ? 'yes' : '**no**') : '—'} | ` +
        `${result ? `${result.ms.toFixed(1)} ms` : '—'} |`,
    )
  }
  out.push('')
  out.push(
    'Both visible-content partial indexes and their unfiltered counterparts are checked. Moderator queries need the unfiltered indexes when their scope includes hidden content.',
  )
  out.push('')

  out.push('## Scenarios')
  out.push('')

  for (const budget of budgets) {
    out.push(`### ${budget.page}`)
    out.push('')
    out.push(`\`${budget.id}\` — ${budget.work}.`)
    out.push('')
    out.push(budget.why)
    out.push('')
  }

  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}

const budgets = await readBudgets()
const { cohorts, mix } = await readCohorts()
const results = await readJson(RESULTS_FILE)
const load = await readJson(LOAD_FILE)
const indexes = await readJson(INDEX_FILE)
const plans = await readPlans()
const generated = render({ budgets, cohorts, mix, load, results, indexes, plans })
await emitGeneratedDoc({
  outputFile: OUTPUT_FILE,
  generated,
  staleReason:
    'A budget or a recorded run changed and the reference did not. Run `pnpm perf:docs` ' +
    'and commit the result — a published p95 that no run produced is worse than no ' +
    'published p95.',
  upToDate: `${budgets.length} budgets`,
  wrote:
    `${budgets.length} budgets, ${results === null ? 'no' : results.results.length} measurements, ` +
    `${load === null ? 'no' : load.results.length} load cohorts`,
})
