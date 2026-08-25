import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  checkParity,
  commandsIn,
  EXCEPTIONS,
  gatesIn,
  JOB,
  WORKFLOW,
} from '../scripts/ci-parity.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const scripts = {
  verify: 'pnpm one && pnpm two && pnpm test',
  one: 'node scripts/one.mjs',
  two: 'node scripts/two.mjs',
  test: 'vitest run',
  'test:coverage': 'vitest run --coverage',
}

function workflowFor(steps: string[], job = JOB): string {
  const body = steps.map((run) => `      - name: step\n        run: ${run}`).join('\n\n')
  return `jobs:\n  ${job}:\n    steps:\n${body}\n\n  other:\n    steps:\n      - run: pnpm nothing\n`
}

const everything = ['pnpm one', 'pnpm two', 'pnpm test:coverage']

describe('checkParity', () => {
  it('passes when every gate has a step', () => {
    const result = checkParity({ scripts, workflow: workflowFor(everything) })
    expect(result.ok).toBe(true)
    expect(result.summary).toContain('2 of the 3 gates')
  })

  it('names every gate that runs in no step', () => {
    const result = checkParity({
      scripts,
      workflow: workflowFor(['pnpm one', 'pnpm test:coverage']),
    })
    expect(result.ok).toBe(false)
    expect(result.details).toContain('pnpm two')
    expect(result.headline).toContain('merges green')
  })

  it('does not accept a gate that appears only in a comment', () => {
    const workflow = workflowFor(everything).replace(
      '        run: pnpm two',
      '        # run: pnpm two\n        run: echo skipped',
    )
    const result = checkParity({ scripts, workflow })
    expect(result.ok).toBe(false)
    expect(result.details).toContain('pnpm two')
  })

  it('fails rather than passing vacuously when verify parses to no gates', () => {
    const result = checkParity({
      scripts: { ...scripts, verify: '   ' },
      workflow: workflowFor(everything),
    })
    expect(result.ok).toBe(false)
    expect(result.headline).toContain('no `verify` script')
  })

  it('fails rather than passing vacuously when the job runs no script', () => {
    const workflow = 'jobs:\n  static:\n    steps:\n      - run: echo nothing\n'
    const result = checkParity({ scripts, workflow })
    expect(result.ok).toBe(false)
    expect(result.headline).toContain('no package.json script')
  })

  it('fails when the job is gone rather than treating it as empty', () => {
    const result = checkParity({ scripts, workflow: workflowFor(everything, 'renamed') })
    expect(result.ok).toBe(false)
    expect(result.headline).toContain('declares no `static` job')
  })

  it('refuses a verify segment it cannot read instead of skipping it', () => {
    const result = checkParity({
      scripts: { ...scripts, verify: 'pnpm one && pnpm --filter pkg two && pnpm test' },
      workflow: workflowFor(everything),
    })
    expect(result.ok).toBe(false)
    expect(result.details.join('\n')).toContain('pnpm --filter pkg two')
  })

  it('refuses a verify segment naming a script that does not exist', () => {
    const result = checkParity({
      scripts: { ...scripts, verify: 'pnpm one && pnpm gone:check && pnpm test' },
      workflow: workflowFor(everything),
    })
    expect(result.ok).toBe(false)
    expect(result.details.join('\n')).toContain('declares no "gone:check" script')
  })

  it('fails when a named exception stops being true', () => {
    const result = checkParity({ scripts, workflow: workflowFor(['pnpm one', 'pnpm two']) })
    expect(result.ok).toBe(false)
    expect(result.headline).toContain('exceptions no longer hold')
  })

  it('fails when an exception names a gate verify no longer runs', () => {
    const result = checkParity({
      scripts: { ...scripts, verify: 'pnpm one && pnpm two' },
      workflow: workflowFor(everything),
    })
    expect(result.ok).toBe(false)
    expect(result.details.join('\n')).toContain('drop the exception')
  })
})

describe('the repository itself', () => {
  it('has exactly one exception, for `test`, covered by `test:coverage`', () => {
    expect(EXCEPTIONS.map((entry) => [entry.gate, entry.satisfiedBy])).toEqual([
      ['test', 'test:coverage'],
    ])
  })

  it('holds `pnpm verify` and the static job to each other', async () => {
    const manifest = JSON.parse(await readFile(`${ROOT}package.json`, 'utf8'))
    const workflow = await readFile(`${ROOT}${WORKFLOW}`, 'utf8')

    const { gates } = gatesIn(manifest.scripts.verify, manifest.scripts)
    expect(gates.length).toBeGreaterThan(20)
    expect(commandsIn(workflow, JOB)!.length).toBeGreaterThan(20)

    const result = checkParity({ scripts: manifest.scripts, workflow })
    expect(result.headline ?? '').toBe('')
    expect(result.ok).toBe(true)
  })
})
