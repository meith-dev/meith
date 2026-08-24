import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ValidationError } from '@meith/core'

import BOARDS_JSON from '../../../scripts/boards.json'
import { optional, parseFlags } from './args'

/**
 * apps/cli/src/plugin-manifest.ts and scripts/board-plugins-gen.mjs are the same
 * distance from the repository root (apps/cli/{src,dist}/<file> either way), so this
 * offset holds whether these commands run from source (tsx) or the built dist/cli.cjs.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const GENERATOR_SCRIPT = join(ROOT, 'scripts/board-plugins-gen.mjs')

/**
 * Every board's board.plugins.json is edited together, from the one list in
 * scripts/boards.json that scripts/board-plugins-gen.mjs reads too. That file
 * and the MEITH_BOARD_PLUGINS_ROOT override are described in
 * docs/development.md, "The board plugin manifests".
 */
interface Board {
  readonly manifestFile: string
  readonly packageFile: string
  readonly outputFile: string
  readonly packageLabel: string
  readonly filterName: string
}

const BOARDS = BOARDS_JSON as readonly Board[]

function boardsRoot(): string {
  return process.env.MEITH_BOARD_PLUGINS_ROOT ?? ROOT
}

interface ManifestEntry {
  readonly key: string
  readonly package: string
  readonly enabled?: boolean
}

interface Manifest {
  readonly plugins: readonly ManifestEntry[]
}

/**
 * `plugin:add`/`plugin:remove` edit source files and rebuild output that only exists in
 * a checkout — unlike `plugin:purge`, which acts on a running board's database and is the
 * one meant to run as `docker compose run --rm web community plugin:purge`. The deployed
 * image is built `FROM node:26-alpine` with only `.next/standalone`, the worker and this
 * CLI's own bundle copied in (see docker/Dockerfile) — no `scripts/`, no `board.plugins.json`,
 * no Biome. Reading a manifest is where that shows up first, so this is where it is named.
 */
async function readManifestFor(board: Board): Promise<Manifest> {
  const path = join(boardsRoot(), board.manifestFile)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ValidationError(
        `${path} does not exist. This command edits source files for every board this ` +
          'repository carries — apps/community and boards/stock — and reruns the generator, ' +
          'so it needs a checkout of the repository, not the deployed image — run it where you ' +
          'would run `pnpm add`, commit both board.plugins.json files and both ' +
          'community.plugins.ts files, then rebuild and redeploy.',
      )
    }
    throw error
  }

  const parsed = JSON.parse(raw) as Partial<Manifest>
  if (!Array.isArray(parsed.plugins)) {
    throw new ValidationError(`${path} must have a "plugins" array.`)
  }
  return { plugins: parsed.plugins }
}

async function writeManifestFor(board: Board, manifest: Manifest): Promise<void> {
  const path = join(boardsRoot(), board.manifestFile)
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

interface GeneratorResult {
  readonly ok: boolean
  readonly output: string
}

/**
 * The one thing this file trusts to know whether a manifest edit is valid: the same
 * generator `pnpm board:gen` runs, for every board it carries. Shelling out — rather
 * than importing scripts/board-plugins.mjs — keeps a plain script and a workspace
 * TypeScript package from needing to share a module; it also means a failed add or
 * remove is reported in exactly the words a person typing `pnpm board:gen` themselves
 * would see, board by board.
 */
function runGenerator(): GeneratorResult {
  try {
    const output = execFileSync(process.execPath, [GENERATOR_SCRIPT], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return { ok: true, output }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message: string }
    const output = [failure.stdout, failure.stderr].filter(Boolean).join('\n').trim()
    return { ok: false, output: output === '' ? failure.message : output }
  }
}

const PACKAGE_KEY_PATTERN = /^@[^/]+\/plugin-([a-z][a-z0-9-]*)$/

/** `@scope/plugin-<key>` is the only shape a key can be read from without asking. */
export function inferKey(packageName: string): string | undefined {
  return PACKAGE_KEY_PATTERN.exec(packageName)?.[1]
}

const ADD_FLAGS = new Set(['key', 'disabled'])

export async function pluginAdd(args: readonly string[]): Promise<number> {
  const { flags, positional } = parseFlags(args)
  const [packageName, ...extraPositional] = positional

  if (packageName === undefined || extraPositional.length > 0) {
    throw new ValidationError('Usage: community plugin:add <package> [--key <key>] [--disabled]')
  }

  const configFlags = [...flags.keys()].filter((name) => !ADD_FLAGS.has(name))
  if (configFlags.length > 0) {
    throw new ValidationError(
      `community plugin:add does not take plugin configuration (--${configFlags[0]}). The ` +
        "manifest has no field for it — a plugin's own settings are the only place its " +
        'configuration lives now, the way plugins/dues moved its plans there. Export a ' +
        'zero-argument plugin and add it with just its package name.',
    )
  }

  const key = optional(flags, 'key') ?? inferKey(packageName)
  if (key === undefined) {
    throw new ValidationError(
      `Can't infer a plugin key from "${packageName}". Pass --key <key> — it must be the same ` +
        "key the package's plugin declares, or defineForumConfig refuses it at build time.",
    )
  }

  const originals = await Promise.all(BOARDS.map((board) => readManifestFor(board)))

  originals.forEach(({ plugins }, index) => {
    if (plugins.some((entry) => entry.key === key)) {
      throw new ValidationError(`"${key}" is already in ${BOARDS[index]?.manifestFile}.`)
    }
  })

  const entry: ManifestEntry = { key, package: packageName, enabled: !flags.has('disabled') }

  await Promise.all(
    BOARDS.map((board, index) =>
      writeManifestFor(board, { plugins: [...(originals[index]?.plugins ?? []), entry] }),
    ),
  )

  const result = runGenerator()
  if (!result.ok) {
    await Promise.all(
      BOARDS.map((board, index) => writeManifestFor(board, originals[index] ?? { plugins: [] })),
    )
    throw new ValidationError(`Could not add "${key}":\n\n${result.output}`)
  }

  const manifestFiles = BOARDS.map((board) => board.manifestFile).join(' and ')
  const outputFiles = BOARDS.map((board) => board.outputFile).join(' and ')
  console.log(
    `Added "${key}" (${packageName}${entry.enabled ? '' : ', disabled'}) to ${manifestFiles} ` +
      `and regenerated ${outputFiles}.`,
  )
  console.log('Rebuild and redeploy for it to take effect.')
  return 0
}

export async function pluginRemove(args: readonly string[]): Promise<number> {
  const { positional } = parseFlags(args)
  const [key, ...extraPositional] = positional

  if (key === undefined || extraPositional.length > 0) {
    throw new ValidationError('Usage: community plugin:remove <key>')
  }

  const originals = await Promise.all(BOARDS.map((board) => readManifestFor(board)))

  originals.forEach(({ plugins }, index) => {
    if (!plugins.some((entry) => entry.key === key)) {
      const present = plugins.map((entry) => entry.key)
      throw new ValidationError(
        present.length === 0
          ? `"${key}" is not in ${BOARDS[index]?.manifestFile} — it lists no plugins.`
          : `"${key}" is not in ${BOARDS[index]?.manifestFile}. Present: ${present.join(', ')}.`,
      )
    }
  })

  await Promise.all(
    BOARDS.map((board, index) =>
      writeManifestFor(board, {
        plugins: (originals[index]?.plugins ?? []).filter((entry) => entry.key !== key),
      }),
    ),
  )

  const result = runGenerator()
  if (!result.ok) {
    await Promise.all(
      BOARDS.map((board, index) => writeManifestFor(board, originals[index] ?? { plugins: [] })),
    )
    throw new ValidationError(`Could not remove "${key}":\n\n${result.output}`)
  }

  const manifestFiles = BOARDS.map((board) => board.manifestFile).join(' and ')
  const outputFiles = BOARDS.map((board) => board.outputFile).join(' and ')
  console.log(`Removed "${key}" from ${manifestFiles} and regenerated ${outputFiles}.`)
  console.log('Rebuild and redeploy for it to take effect.')
  return 0
}
