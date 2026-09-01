import { execFile } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'

import { DEFAULT_REPOSITORY_URL, type ScaffoldTarget, scaffold } from './scaffold'

const execFileAsync = promisify(execFile)

export const TEMPLATE_BOARD_NAME = 'meith-board'

export const TEMPLATE_REPOSITORIES: Readonly<Record<ScaffoldTarget, string>> = {
  'self-host': 'meith-dev/template',
  vercel: 'meith-dev/vercel-template',
}

export const RELEASE_NOTES_URL = 'https://github.com/meith-dev/meith/releases/tag'

export function templateTarballUrl(target: ScaffoldTarget, version: string): string {
  return `https://codeload.github.com/${TEMPLATE_REPOSITORIES[target]}/tar.gz/refs/tags/v${version}`
}

export function parseExactVersion(value: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (match === null) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareExactVersions(left: string, right: string): number {
  const a = parseExactVersion(left)
  const b = parseExactVersion(right)
  if (a === null || b === null) return 0
  for (let part = 0; part < 3; part++) {
    if ((a[part] as number) !== (b[part] as number))
      return (a[part] as number) - (b[part] as number)
  }
  return 0
}

export function substituteBoardName(content: string, name: string): string {
  if (name === TEMPLATE_BOARD_NAME) return content
  return content.split(TEMPLATE_BOARD_NAME).join(name)
}

export function normalizeActionPins(content: string): string {
  return content
    .split('\n')
    .map((line) => (/^\s*(- )?uses:\s/.test(line) ? line.replace(/@\S+(\s*#.*)?$/, '@pin') : line))
    .join('\n')
}

function comparable(path: string, content: string): string {
  return path.startsWith('.github/workflows/') ? normalizeActionPins(content) : content
}

function tarText(block: Uint8Array, start: number, length: number): string {
  const slice = block.subarray(start, start + length)
  const end = slice.indexOf(0)
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end))
}

export function unpackTemplateTarball(data: Uint8Array, name: string): Map<string, string> {
  const tar = gunzipSync(data)
  const files = new Map<string, string>()

  for (let at = 0; at + 512 <= tar.length; ) {
    const header = tar.subarray(at, at + 512)
    at += 512
    if (header.every((byte) => byte === 0)) break

    const size = Number.parseInt(tarText(header, 124, 12).trim() || '0', 8)
    const type = header[156] ?? 0
    const prefix = tarText(header, 345, 155)
    const path = prefix === '' ? tarText(header, 0, 100) : `${prefix}/${tarText(header, 0, 100)}`

    if (type === 48 || type === 0) {
      const relative = path.split('/').slice(1).join('/')
      if (relative !== '') {
        const content = new TextDecoder().decode(tar.subarray(at, at + size))
        files.set(relative, substituteBoardName(content, name))
      }
    }

    at += Math.ceil(size / 512) * 512
  }

  return files
}

export async function fetchPreviousTree(
  target: ScaffoldTarget,
  version: string,
  name: string,
): Promise<ReadonlyMap<string, string> | null> {
  try {
    const response = await fetch(templateTarballUrl(target, version), {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) return null
    return unpackTemplateTarball(new Uint8Array(await response.arrayBuffer()), name)
  } catch {
    return null
  }
}

type DependencyMap = Readonly<Record<string, string>>

interface ManifestShape {
  readonly [key: string]: unknown
  readonly dependencies?: DependencyMap
  readonly devDependencies?: DependencyMap
  readonly scripts?: Readonly<Record<string, string>>
}

function mergeDependencies(
  current: DependencyMap,
  next: DependencyMap,
  newVersion: string,
): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const [name, range] of Object.entries(current)) {
    merged[name] = next[name] ?? (name.startsWith('@meith/') ? newVersion : range)
  }
  for (const [name, range] of Object.entries(next)) {
    if (!(name in merged)) merged[name] = range
  }
  return merged
}

function mergeScripts(
  current: Readonly<Record<string, string>> | undefined,
  previous: Readonly<Record<string, string>> | undefined,
  next: Readonly<Record<string, string>>,
  degraded: boolean,
): Record<string, string> {
  const merged: Record<string, string> = { ...(current ?? {}) }
  for (const [key, value] of Object.entries(next)) {
    const held = current?.[key]
    if (held === undefined) {
      if (degraded || previous?.[key] === undefined) merged[key] = value
      continue
    }
    if (held === value || held === previous?.[key]) merged[key] = value
  }
  return merged
}

export function mergeManifest(
  currentText: string,
  previousText: string | null,
  nextText: string,
  newVersion: string,
): string {
  const current = JSON.parse(currentText) as ManifestShape
  const previous = previousText === null ? null : (JSON.parse(previousText) as ManifestShape)
  const next = JSON.parse(nextText) as ManifestShape

  const merged: Record<string, unknown> = { ...current }

  merged.dependencies = mergeDependencies(
    current.dependencies ?? {},
    next.dependencies ?? {},
    newVersion,
  )
  if (current.devDependencies !== undefined) {
    merged.devDependencies = mergeDependencies(current.devDependencies, {}, newVersion)
  }
  if (next.scripts !== undefined) {
    merged.scripts = mergeScripts(
      current.scripts,
      previous?.scripts,
      next.scripts,
      previous === null,
    )
  }
  for (const field of ['type', 'engines']) {
    if (!(field in next)) continue
    const untouched =
      previous !== null && JSON.stringify(current[field]) === JSON.stringify(previous[field])
    if (!(field in current) || untouched) merged[field] = next[field]
  }

  return `${JSON.stringify(merged, null, 2)}\n`
}

export interface UpdateInputs {
  readonly current: ReadonlyMap<string, string>
  readonly previous: ReadonlyMap<string, string> | null
  readonly next: ReadonlyMap<string, string>
  readonly newVersion: string
}

export interface UpdatePlan {
  readonly writes: ReadonlyMap<string, string>
  readonly deletes: readonly string[]
  readonly created: readonly string[]
  readonly updated: readonly string[]
  readonly skipped: readonly string[]
  readonly review: readonly string[]
}

export function planUpdate({ current, previous, next, newVersion }: UpdateInputs): UpdatePlan {
  const writes = new Map<string, string>()
  const deletes: string[] = []
  const created: string[] = []
  const updated: string[] = []
  const skipped: string[] = []
  const review: string[] = []

  const currentManifest = current.get('package.json')
  const nextManifest = next.get('package.json')
  if (currentManifest !== undefined && nextManifest !== undefined) {
    const merged = mergeManifest(
      currentManifest,
      previous?.get('package.json') ?? null,
      nextManifest,
      newVersion,
    )
    if (merged !== currentManifest) {
      writes.set('package.json', merged)
      updated.push('package.json')
    }
  }

  if (previous === null) {
    for (const [path, content] of next) {
      if (path === 'package.json') continue
      if (current.get(path) !== content) review.push(path)
    }
    return { writes, deletes, created, updated, skipped, review: review.sort() }
  }

  const paths = new Set([...next.keys(), ...previous.keys()])
  paths.delete('package.json')

  for (const path of [...paths].sort()) {
    const held = current.get(path)
    const before = previous.get(path)
    const after = next.get(path)

    if (after !== undefined) {
      if (held === undefined) {
        if (before === undefined) {
          writes.set(path, after)
          created.push(path)
        }
        continue
      }
      if (held === after) continue
      if (before !== undefined && comparable(path, held) === comparable(path, before)) {
        writes.set(path, after)
        updated.push(path)
      } else {
        skipped.push(path)
      }
      continue
    }

    if (held === undefined || before === undefined) continue
    if (comparable(path, held) === comparable(path, before)) deletes.push(path)
    else skipped.push(path)
  }

  return { writes, deletes, created, updated, skipped: skipped.sort(), review }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function refreshNpmLockfile(cwd: string): Promise<string | null> {
  try {
    await execFileAsync(
      'npm',
      ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd },
    )
    return null
  } catch {
    return 'package-lock.json could not be refreshed — run `npm install` here to bring it up to date.'
  }
}

export interface RunUpdateOptions {
  readonly cwd?: string
  readonly loadPrevious?: (
    target: ScaffoldTarget,
    version: string,
    name: string,
  ) => Promise<ReadonlyMap<string, string> | null>
  readonly refreshLockfile?: (cwd: string) => Promise<string | null>
}

export interface UpdateResult {
  readonly code: number
  readonly lines: readonly string[]
}

export async function runUpdate(
  newVersion: string,
  options: RunUpdateOptions = {},
): Promise<UpdateResult> {
  const cwd = options.cwd ?? process.cwd()

  const manifestText = await readIfPresent(join(cwd, 'package.json'))
  if (manifestText === null) {
    return {
      code: 1,
      lines: [
        'create-meith update: no package.json here.',
        'Run this inside the board directory — the one `npx create-meith` scaffolded,',
        'or the clone of your board repository.',
      ],
    }
  }

  let manifest: ManifestShape
  try {
    manifest = JSON.parse(manifestText) as ManifestShape
  } catch {
    return { code: 1, lines: ['create-meith update: package.json here is not valid JSON.'] }
  }

  const currentVersion = manifest.dependencies?.['@meith/web']
  if (currentVersion === undefined) {
    return {
      code: 1,
      lines: [
        'create-meith update: this package.json does not depend on @meith/web,',
        'so this does not look like a Meith board.',
      ],
    }
  }

  const parsedCurrent = parseExactVersion(currentVersion)
  if (parsedCurrent === null) {
    return {
      code: 1,
      lines: [
        `create-meith update: @meith/web is pinned to '${currentVersion}', not an exact X.Y.Z version.`,
        'Pin it first — `npm install --save-exact @meith/web@<version>` — so the updater',
        'can tell which release this board is on.',
      ],
    }
  }

  const parsedNew = parseExactVersion(newVersion)
  if (parsedNew === null) {
    return {
      code: 1,
      lines: [`create-meith update: cannot update to '${newVersion}' — not an exact version.`],
    }
  }

  if (compareExactVersions(currentVersion, newVersion) === 0) {
    return { code: 0, lines: [`Already at ${newVersion} — nothing to update.`] }
  }

  if (compareExactVersions(currentVersion, newVersion) > 0) {
    return {
      code: 1,
      lines: [
        `create-meith update: this board is on ${currentVersion}, newer than ${newVersion}.`,
        'Downgrades are refused — migrations are forward-only. To update, run the',
        'newest updater: `npx create-meith@latest update`.',
      ],
    }
  }

  if ((parsedNew[0] as number) - (parsedCurrent[0] as number) > 2) {
    const stage = (parsedCurrent[0] as number) + 2
    return {
      code: 1,
      lines: [
        `create-meith update: ${currentVersion} to ${newVersion} jumps more than two majors,`,
        'which is further than upgrades are tested to span. Update in stages instead —',
        `\`npx create-meith@${stage} update\` first, deploy and run \`meith upgrade\`,`,
        'then come back to `npx create-meith@latest update`.',
      ],
    }
  }

  const name =
    typeof manifest.name === 'string' && manifest.name !== '' ? manifest.name : TEMPLATE_BOARD_NAME
  const target: ScaffoldTarget = (await exists(join(cwd, 'vercel.json'))) ? 'vercel' : 'self-host'

  const next = scaffold({
    name,
    version: newVersion,
    repositoryUrl: DEFAULT_REPOSITORY_URL,
    target,
  })
  const previous = await (options.loadPrevious ?? fetchPreviousTree)(target, currentVersion, name)

  const paths = new Set(['package.json', ...next.keys(), ...(previous?.keys() ?? [])])
  const current = new Map<string, string>()
  for (const path of paths) {
    const content = await readIfPresent(join(cwd, path))
    if (content !== null) current.set(path, content)
  }

  const plan = planUpdate({ current, previous, next, newVersion })

  for (const [path, content] of plan.writes) {
    const absolute = join(cwd, path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, content, 'utf8')
  }
  for (const path of plan.deletes) {
    await rm(join(cwd, path), { force: true })
  }

  const lockfileWarning =
    plan.writes.size > 0 && (await exists(join(cwd, 'package-lock.json')))
      ? await (options.refreshLockfile ?? refreshNpmLockfile)(cwd)
      : null

  const templateUrl = `https://github.com/${TEMPLATE_REPOSITORIES[target]}`
  const nextManifest = JSON.parse(next.get('package.json') ?? '{}') as ManifestShape
  const nextPin = nextManifest.dependencies?.next

  const lines: string[] = []
  const changed = plan.writes.size + plan.deletes.length

  if (changed === 0) {
    lines.push(`Nothing to write — every file already matches ${newVersion}.`)
  } else {
    lines.push(
      `Updated ${name} from ${currentVersion} to ${newVersion} — ${changed} file${changed === 1 ? '' : 's'} changed.`,
      '',
    )
  }

  for (const path of plan.updated) {
    lines.push(
      path === 'package.json'
        ? `  updated package.json — every @meith/* pin to ${newVersion}${nextPin === undefined ? '' : `, next to ${nextPin}`}`
        : `  updated ${path}`,
    )
  }
  for (const path of plan.created) lines.push(`  added   ${path}`)
  for (const path of plan.deletes) lines.push(`  removed ${path} — this release no longer ships it`)
  for (const path of plan.skipped) {
    lines.push(
      `  kept    ${path} — it differs from the ${currentVersion} scaffold; compare it with ${templateUrl} at v${newVersion}`,
    )
  }

  if (previous === null) {
    lines.push(
      '',
      `Could not read the v${currentVersion} template from ${templateUrl}, so only`,
      'package.json was updated. Review these files against that repository at',
      `v${newVersion} — this release may have changed them:`,
      ...plan.review.map((path) => `  ${path}`),
    )
  }

  if (lockfileWarning !== null) lines.push('', lockfileWarning)

  if (changed > 0) {
    lines.push(
      '',
      'Next:',
      '  1. Review the diff, commit, and push.',
      '  2. Take a backup, then deploy. The release notes name the migrations:',
      `     ${RELEASE_NOTES_URL}/v${newVersion}`,
      '  3. Once the new version serves, run `meith upgrade` against the board —',
      '     the admin panel shows a notice until it has run.',
    )
  }

  return { code: 0, lines }
}
