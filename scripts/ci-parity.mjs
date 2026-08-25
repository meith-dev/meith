export const WORKFLOW = '.github/workflows/ci.yml'
export const JOB = 'static'

export const EXCEPTIONS = [
  {
    gate: 'test',
    satisfiedBy: 'test:coverage',
    reason:
      'the static job runs the suite once, under coverage — `pnpm test:coverage` is `pnpm test` ' +
      'plus the thresholds, over the same files and the same tests — and the migrations job ' +
      'runs `pnpm test` again against real Postgres',
  },
]

export function gatesIn(verify, scripts) {
  const gates = []
  const unreadable = []

  for (const segment of verify.split('&&')) {
    const command = segment.trim()
    const named = /^pnpm ([\w.:-]+)$/.exec(command)

    if (named === null) {
      unreadable.push(
        `"${command}" — verify is expected to chain \`pnpm <script>\` invocations with &&, and ` +
          'a segment this check cannot read is a gate it cannot police',
      )
      continue
    }

    if (!(named[1] in scripts)) {
      unreadable.push(`"${command}" — package.json declares no "${named[1]}" script`)
      continue
    }

    gates.push(named[1])
  }

  return { gates, unreadable }
}

export function commandsIn(workflow, job) {
  const lines = workflow.split('\n')
  const start = lines.indexOf(`  ${job}:`)
  if (start === -1) return null

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^ {2}[\w-]+:\s*$/.test(lines[index])) {
      end = index
      break
    }
  }

  const commands = []
  let blockIndent = null

  for (const line of lines.slice(start + 1, end)) {
    const indent = line.length - line.trimStart().length

    if (blockIndent !== null) {
      if (line.trim() === '' || indent >= blockIndent) {
        commands.push(line)
        continue
      }
      blockIndent = null
    }

    if (line.trimStart().startsWith('#')) continue

    const step = /^\s*(?:-\s+)?run:\s*(.*)$/.exec(line)
    if (step === null) continue

    const value = step[1].trim()
    if (/^[|>][+-]?\d*$/.test(value)) {
      blockIndent = indent + 1
      continue
    }

    commands.push(value)
  }

  return commands
}

export function scriptsRunBy(commands, scripts) {
  const ran = new Set()

  for (const command of commands) {
    if (command.trimStart().startsWith('#')) continue
    for (const match of command.matchAll(/(?<![\w.:-])pnpm\s+([\w.:-]+)/g)) {
      if (match[1] in scripts) ran.add(match[1])
    }
  }

  return ran
}

export function checkParity({ scripts, workflow, job = JOB, exceptions = EXCEPTIONS }) {
  const fail = (headline, details = []) => ({ ok: false, headline, details })

  const verify = scripts?.verify
  if (typeof verify !== 'string' || verify.trim() === '') {
    return fail('package.json declares no `verify` script, so there is nothing to hold CI to.')
  }

  const { gates, unreadable } = gatesIn(verify, scripts)
  if (unreadable.length > 0)
    return fail('`verify` has segments this check cannot read.', unreadable)
  if (gates.length === 0) {
    return fail('read `verify` and found no gates in it, which cannot be right.')
  }

  const commands = commandsIn(workflow, job)
  if (commands === null) return fail(`${WORKFLOW} declares no \`${job}\` job.`)
  if (commands.length === 0) {
    return fail(`read ${WORKFLOW}'s \`${job}\` job and found no steps that run anything.`)
  }

  const ran = scriptsRunBy(commands, scripts)
  if (ran.size === 0) {
    return fail(`read ${WORKFLOW}'s \`${job}\` job and found it running no package.json script.`)
  }

  const excused = new Map()
  const broken = []

  for (const { gate, satisfiedBy, reason } of exceptions) {
    if (!gates.includes(gate)) {
      broken.push(`"${gate}" is excused here and \`verify\` no longer runs it — drop the exception`)
      continue
    }
    if (!ran.has(satisfiedBy)) {
      broken.push(
        `"${gate}" is excused because ${reason}, and the \`${job}\` job no longer runs ` +
          `\`pnpm ${satisfiedBy}\` — the exception has stopped being true`,
      )
      continue
    }
    excused.set(gate, reason)
  }

  if (broken.length > 0) return fail('the named exceptions no longer hold.', broken)

  const missing = gates.filter((gate) => !ran.has(gate) && !excused.has(gate))

  if (missing.length > 0) {
    return fail(
      `${missing.length} gate${missing.length === 1 ? '' : 's'} in \`pnpm verify\` run in no ` +
        `step of ${WORKFLOW}'s \`${job}\` job, so a pull request that breaks ` +
        `${missing.length === 1 ? 'it' : 'them'} merges green.`,
      [
        ...missing.map((gate) => `pnpm ${gate}`),
        'add a step for each, or name it in EXCEPTIONS in scripts/ci-parity.mjs with the reason ' +
          'it is covered elsewhere — see docs/development.md, "The commands"',
      ],
    )
  }

  const excusedNote =
    excused.size === 0
      ? ''
      : `, and ${[...excused.keys()].map((gate) => `"${gate}"`).join(', ')} excused by name`

  return {
    ok: true,
    summary:
      `${gates.length - excused.size} of the ${gates.length} gates in \`pnpm verify\` run in ` +
      `${WORKFLOW}'s \`${job}\` job, which runs ${ran.size} package.json ` +
      `scripts${excusedNote}`,
  }
}
