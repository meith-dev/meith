import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ValidationError } from '@meith/core'

import { optional, parseFlags } from './args'

/**
 * apps/cli/src/plugin-manifest.ts and scripts/board-plugins-gen.mjs are the same
 * distance from the repository root (apps/cli/{src,dist}/<file> either way), so this
 * offset holds whether these commands run from source (tsx) or the built dist/cli.cjs.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const MANIFEST_PATH = join(ROOT, 'apps/community/board.plugins.json')
const GENERATOR_SCRIPT = join(ROOT, 'scripts/board-plugins-gen.mjs')

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
 * no Biome. Reading the manifest is where that shows up first, so this is where it is named.
 */
async function readManifest(): Promise<Manifest> {
  let raw: string
  try {
    raw = await readFile(MANIFEST_PATH, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ValidationError(
        `${MANIFEST_PATH} does not exist. This command edits source files and reruns the ` +
          'generator, so it needs a checkout of the repository, not the deployed image — run ' +
          'it where you would run `pnpm add`, commit board.plugins.json and ' +
          'community.plugins.ts, then rebuild and redeploy.',
      )
    }
    throw error
  }

  const parsed = JSON.parse(raw) as Partial<Manifest>
  if (!Array.isArray(parsed.plugins)) {
    throw new ValidationError('apps/community/board.plugins.json must have a "plugins" array.')
  }
  return { plugins: parsed.plugins }
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

interface GeneratorResult {
  readonly ok: boolean
  readonly output: string
}

/**
 * The one thing this file trusts to know whether a manifest edit is valid: the same
 * generator `pnpm board:gen` runs. Shelling out — rather than importing
 * scripts/board-plugins.mjs — keeps a plain script and a workspace TypeScript package
 * from needing to share a module; it also means a failed add or remove is reported in
 * exactly the words a person typing `pnpm board:gen` themselves would see.
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

  const manifest = await readManifest()
  if (manifest.plugins.some((entry) => entry.key === key)) {
    throw new ValidationError(`"${key}" is already in board.plugins.json.`)
  }

  const entry: ManifestEntry = { key, package: packageName, enabled: !flags.has('disabled') }
  await writeManifest({ plugins: [...manifest.plugins, entry] })

  const result = runGenerator()
  if (!result.ok) {
    await writeManifest(manifest)
    throw new ValidationError(`Could not add "${key}":\n\n${result.output}`)
  }

  console.log(
    `Added "${key}" (${packageName}${entry.enabled ? '' : ', disabled'}) to board.plugins.json ` +
      'and regenerated community.plugins.ts.',
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

  const manifest = await readManifest()
  if (!manifest.plugins.some((entry) => entry.key === key)) {
    const present = manifest.plugins.map((entry) => entry.key)
    throw new ValidationError(
      present.length === 0
        ? `"${key}" is not in board.plugins.json — it lists no plugins.`
        : `"${key}" is not in board.plugins.json. Present: ${present.join(', ')}.`,
    )
  }

  await writeManifest({ plugins: manifest.plugins.filter((entry) => entry.key !== key) })

  const result = runGenerator()
  if (!result.ok) {
    await writeManifest(manifest)
    throw new ValidationError(`Could not remove "${key}":\n\n${result.output}`)
  }

  console.log(`Removed "${key}" from board.plugins.json and regenerated community.plugins.ts.`)
  console.log('Rebuild and redeploy for it to take effect.')
  return 0
}
