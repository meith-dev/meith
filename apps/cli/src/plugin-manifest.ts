import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ValidationError } from '@meith/core'

import { optional, parseFlags } from './args'

function repoRoot(): string {
  return fileURLToPath(new URL('../../../', import.meta.url))
}

interface Board {
  readonly manifestFile: string
  readonly packageFile: string
  readonly outputFile: string
  readonly packageLabel: string
  readonly filterName: string
}

interface ManifestEntry {
  readonly key: string
  readonly package: string
  readonly enabled?: boolean
}

interface Manifest {
  readonly plugins: readonly ManifestEntry[]
}

interface GeneratorResult {
  readonly ok: boolean
  readonly output: string
}

interface Mode {
  readonly root: string
  readonly boards: readonly Board[]
  installPackage(packageName: string): void
  regenerate(): GeneratorResult
  missingManifest(path: string): string
}

export function installBoardPackage(root: string, packageName: string): void {
  try {
    execFileSync('npm', ['install', '--save-exact', packageName], { cwd: root, stdio: 'inherit' })
  } catch {
    throw new ValidationError(
      `Could not install ${packageName} — npm reported the error above. Fix that and rerun.`,
    )
  }
}

const BOARD_MODE_BOARD: Board = {
  manifestFile: 'board.plugins.json',
  packageFile: 'package.json',
  outputFile: 'meith.plugins.ts',
  packageLabel: 'this board',
  filterName: '',
}

function monorepoMode(boardsFile: string): Mode {
  const boards = JSON.parse(readFileSync(boardsFile, 'utf8')) as readonly Board[]
  const root = process.env.MEITH_BOARD_PLUGINS_ROOT ?? repoRoot()

  return {
    root,
    boards,
    installPackage: () => {},
    regenerate: () => runGenerator(join(repoRoot(), 'scripts/board-plugins-gen.mjs')),
    missingManifest: (path) =>
      `${path} does not exist. This command edits source files for every board this ` +
      'repository carries — apps/community and boards/stock — and reruns the generator, ' +
      'so it needs a checkout of the repository, not the deployed image — run it where you ' +
      'would run `pnpm add`, commit both board.plugins.json files and both ' +
      'meith.plugins.ts files, then rebuild and redeploy.',
  }
}

function boardMode(): Mode {
  const root = process.env.MEITH_BOARD_PLUGINS_ROOT ?? process.cwd()

  return {
    root,
    boards: [BOARD_MODE_BOARD],
    installPackage: (packageName) => installBoardPackage(root, packageName),
    regenerate: () => regenerateBoard(root),
    missingManifest: (path) =>
      `${path} does not exist. Run this from the board create-meith scaffolded — the ` +
      'directory with meith.config.ts and board.plugins.json in it.',
  }
}

function resolveMode(): Mode {
  const boardsFile = join(repoRoot(), 'scripts/boards.json')
  return existsSync(boardsFile) ? monorepoMode(boardsFile) : boardMode()
}

const PLUGIN_KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

function toIdentifier(key: string): string {
  return key.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
}

function dependencyNames(packageFile: string): Set<string> {
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return new Set(Object.keys(pkg.dependencies ?? {}))
}

function validateBoardManifest(
  plugins: readonly ManifestEntry[],
  dependencies: ReadonlySet<string>,
): void {
  const identifiers = new Map<string, string>()

  for (const entry of plugins) {
    if (!PLUGIN_KEY_PATTERN.test(entry.key)) {
      throw new Error(
        `"${entry.key}" is not a valid plugin key. It must be lower-case letters, digits and ` +
          'hyphens, start with a letter, and be 2–40 characters long.',
      )
    }

    const identifier = toIdentifier(entry.key)
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      throw new Error(
        `"${entry.key}" is a valid key, but the identifier meith.plugins.ts would bind for it, ` +
          `"${identifier}", is not a valid one — each hyphen must be followed by a letter or digit.`,
      )
    }

    const collision = identifiers.get(identifier)
    if (collision !== undefined) {
      throw new Error(
        `"${entry.key}" and "${collision}" both generate the identifier "${identifier}". ` +
          'Rename one so the generated imports do not collide.',
      )
    }
    identifiers.set(identifier, entry.key)

    if (!NPM_PACKAGE_NAME_PATTERN.test(entry.package) || entry.package.length > 214) {
      throw new Error(`"${entry.package}" (key "${entry.key}") is not a valid npm package name.`)
    }

    if (!dependencies.has(entry.package)) {
      throw new Error(
        `"${entry.package}" (key "${entry.key}") is not installed. Run ` +
          `\`npm install ${entry.package}\` first, then rerun this.`,
      )
    }
  }
}

const BOARD_HEADER = `// Generated from board.plugins.json by \`meith plugin:add\` and \`meith plugin:remove\`.
//
// The simple path is those commands, or editing board.plugins.json and running one of
// them. A plugin that does not fit that convention can be added here by hand instead —
// keep it out of board.plugins.json so a regenerate does not drop it.
//
// docs/customization/plugins.md explains both.`

export function renderBoardModule(plugins: readonly ManifestEntry[]): string {
  const imports = plugins.map((entry) => {
    const name = toIdentifier(entry.key)
    return `import { messages as ${name}Messages, plugin as ${name}Plugin } from '${entry.package}'`
  })

  const entries = plugins.map((entry) => {
    const name = toIdentifier(entry.key)
    const enabled = entry.enabled === false ? 'false' : 'true'
    return (
      `  { key: '${entry.key}', enabled: ${enabled}, ` +
      `plugin: ${name}Plugin, messages: ${name}Messages },`
    )
  })

  const importBlock = ["import type { InstalledPlugin } from '@meith/web/config'", ...imports].join(
    '\n',
  )

  const listBlock =
    entries.length === 0
      ? 'export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = []'
      : `export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = [\n${entries.join('\n')}\n]`

  const functionBlock = `export function installedPluginDefinitions() {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin)
}`

  return `${[BOARD_HEADER, importBlock, listBlock, functionBlock].join('\n\n')}\n`
}

export function regenerateBoard(root: string): GeneratorResult {
  try {
    const board = BOARD_MODE_BOARD
    const raw = readFileSync(join(root, board.manifestFile), 'utf8')
    const plugins = (JSON.parse(raw) as Manifest).plugins
    const dependencies = dependencyNames(join(root, board.packageFile))

    validateBoardManifest(plugins, dependencies)
    writeFileSync(join(root, board.outputFile), renderBoardModule(plugins), 'utf8')

    return { ok: true, output: `${plugins.length} plugin(s)` }
  } catch (error) {
    return { ok: false, output: (error as Error).message }
  }
}

async function readManifestFor(mode: Mode, board: Board): Promise<Manifest> {
  const path = join(mode.root, board.manifestFile)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ValidationError(mode.missingManifest(path))
    }
    throw error
  }

  const parsed = JSON.parse(raw) as Partial<Manifest>
  if (!Array.isArray(parsed.plugins)) {
    throw new ValidationError(`${path} must have a "plugins" array.`)
  }

  const extraFields = Object.keys(parsed).filter((field) => field !== 'plugins')
  if (extraFields.length > 0) {
    throw new ValidationError(
      `${path} has ${extraFields.length === 1 ? 'a field' : 'fields'} plugin:add/plugin:remove ` +
        `do not know how to carry forward: ${extraFields.join(', ')}. "plugins" is the ` +
        "manifest's only field — remove the rest by hand, since rewriting the file here would " +
        'otherwise drop them silently.',
    )
  }

  return { plugins: parsed.plugins }
}

async function writeManifestFor(mode: Mode, board: Board, manifest: Manifest): Promise<void> {
  const path = join(mode.root, board.manifestFile)
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function runGenerator(generatorScript: string): GeneratorResult {
  try {
    const output = execFileSync(process.execPath, [generatorScript], {
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

export function inferKey(packageName: string): string | undefined {
  return PACKAGE_KEY_PATTERN.exec(packageName)?.[1]
}

const ADD_FLAGS = new Set(['key', 'disabled'])

export async function pluginAdd(args: readonly string[]): Promise<number> {
  const { flags, positional } = parseFlags(args)
  const [packageName, ...extraPositional] = positional

  if (packageName === undefined || extraPositional.length > 0) {
    throw new ValidationError('Usage: meith plugin:add <package> [--key <key>] [--disabled]')
  }

  const configFlags = [...flags.keys()].filter((name) => !ADD_FLAGS.has(name))
  if (configFlags.length > 0) {
    throw new ValidationError(
      `meith plugin:add does not take plugin configuration (--${configFlags[0]}). The ` +
        "manifest has no field for it — a plugin's own settings are the only place its " +
        "configuration lives now, the way MEI-74 moved plugins/dues's plans there. Export a " +
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

  const mode = resolveMode()
  const originals = await Promise.all(mode.boards.map((board) => readManifestFor(mode, board)))

  originals.forEach(({ plugins }, index) => {
    if (plugins.some((entry) => entry.key === key)) {
      throw new ValidationError(`"${key}" is already in ${mode.boards[index]?.manifestFile}.`)
    }
  })

  mode.installPackage(packageName)

  const entry: ManifestEntry = { key, package: packageName, enabled: !flags.has('disabled') }

  await Promise.all(
    mode.boards.map((board, index) =>
      writeManifestFor(mode, board, { plugins: [...(originals[index]?.plugins ?? []), entry] }),
    ),
  )

  const result = mode.regenerate()
  if (!result.ok) {
    await Promise.all(
      mode.boards.map((board, index) =>
        writeManifestFor(mode, board, originals[index] ?? { plugins: [] }),
      ),
    )
    throw new ValidationError(`Could not add "${key}":\n\n${result.output}`)
  }

  const manifestFiles = mode.boards.map((board) => board.manifestFile).join(' and ')
  const outputFiles = mode.boards.map((board) => board.outputFile).join(' and ')
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
    throw new ValidationError('Usage: meith plugin:remove <key>')
  }

  const mode = resolveMode()
  const originals = await Promise.all(mode.boards.map((board) => readManifestFor(mode, board)))

  originals.forEach(({ plugins }, index) => {
    if (!plugins.some((entry) => entry.key === key)) {
      const present = plugins.map((entry) => entry.key)
      throw new ValidationError(
        present.length === 0
          ? `"${key}" is not in ${mode.boards[index]?.manifestFile} — it lists no plugins.`
          : `"${key}" is not in ${mode.boards[index]?.manifestFile}. Present: ${present.join(', ')}.`,
      )
    }
  })

  await Promise.all(
    mode.boards.map((board, index) =>
      writeManifestFor(mode, board, {
        plugins: (originals[index]?.plugins ?? []).filter((entry) => entry.key !== key),
      }),
    ),
  )

  const result = mode.regenerate()
  if (!result.ok) {
    await Promise.all(
      mode.boards.map((board, index) =>
        writeManifestFor(mode, board, originals[index] ?? { plugins: [] }),
      ),
    )
    throw new ValidationError(`Could not remove "${key}":\n\n${result.output}`)
  }

  const manifestFiles = mode.boards.map((board) => board.manifestFile).join(' and ')
  const outputFiles = mode.boards.map((board) => board.outputFile).join(' and ')
  console.log(`Removed "${key}" from ${manifestFiles} and regenerated ${outputFiles}.`)
  console.log('Rebuild and redeploy for it to take effect.')
  return 0
}
