#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const BUDGETS_FILE = 'packages/testkit/src/load/budgets.ts'
const RESULTS_FILE = 'docs/perf-results.json'
const INDEX_FILE = 'docs/perf-indexes.json'
const PLANS_FILE = 'packages/testkit/src/load/index-plans.ts'
const OUTPUT_FILE = 'docs/performance.md'

async function readBudgets() {
  const source = await readFile(join(ROOT, BUDGETS_FILE), 'utf8')
  const start = source.indexOf('export const BUDGETS')
  if (start === -1) throw new Error(`No BUDGETS array in ${BUDGETS_FILE}`)

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
  const assign = source.indexOf('=', source.indexOf('export const INDEX_PLANS'))
  const open = source.indexOf('[', assign)

  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i++) {
    if (source[i] === '[') depth++
    else if (source[i] === ']' && --depth === 0) {
      end = i
      break
    }
  }

  return splitObjects(source.slice(open + 1, end)).map((entry) => ({
    id: field(entry, 'id'),
    page: field(entry, 'page'),
    index: field(entry, 'index'),
    why: field(entry, 'why'),
  }))
}

const ms = (value) => `${value.toFixed(1)} ms`

function render({ budgets, results, indexes, plans }) {
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
    out.push('The absolute numbers belong to that machine. What travels between machines')
    out.push('is the **shape**: which scenarios sit near their budget, and whether a deep')
    out.push('page costs more than a first page. Compare ratios, not milliseconds.')
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

  out.push('## Partial visible indexes')
  out.push('')
  out.push('`EXPLAIN` evidence that the partial `visibility` indexes are actually used.')
  out.push('This is that evidence, and it is also a **check**: `pnpm perf explain`')
  out.push('fails when the planner stops choosing one.')
  out.push('')
  out.push('That failure is the one worth guarding. A partial index only matches a query')
  out.push('whose predicate the planner can prove implies it, so a read path that starts')
  out.push('passing a variable visibility scope where it passed a literal falls silently')
  out.push('onto a sequential scan of the largest table on the board. Nothing errors.')
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
  out.push('Each partial index has an unfiltered twin, and the twins are checked too. A')
  out.push('moderator seeing unapproved and deleted content *cannot* use the partial')
  out.push('index — their predicate does not imply it — so without the twin their forum')
  out.push('view is a sequential scan. That failure is invisible to every test written')
  out.push('from a member’s point of view, which is most of them.')
  out.push('')

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
const results = await readJson(RESULTS_FILE)
const indexes = await readJson(INDEX_FILE)
const plans = await readPlans()
const generated = render({ budgets, results, indexes, plans })
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
