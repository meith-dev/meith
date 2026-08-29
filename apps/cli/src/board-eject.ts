import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_REPOSITORY_URL, scaffold, validateName } from 'create-meith'

import { ValidationError } from '@meith/core'

import { CODE_VERSION } from './upgrade'
import { translateWriteError } from './write-errors'

function defaultManifestPath(): string {
  return join(
    fileURLToPath(new URL('../../../', import.meta.url)),
    'boards/stock/board.plugins.json',
  )
}

interface ManifestEntry {
  readonly key: string
  readonly package: string
  readonly enabled?: boolean
}

interface Manifest {
  readonly plugins: readonly ManifestEntry[]
}

function manifestPath(): string {
  return process.env.BOARD_PLUGINS_MANIFEST ?? defaultManifestPath()
}

const PLUGIN_KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

export function validateEjectManifest(plugins: readonly ManifestEntry[], path: string): void {
  const seen = new Set<string>()
  const identifiers = new Map<string, string>()

  for (const entry of plugins) {
    if (typeof entry.key !== 'string' || typeof entry.package !== 'string') {
      throw new ValidationError(
        `${path}: every entry needs a string "key" and "package". Got ${JSON.stringify(entry)}.`,
      )
    }

    if (seen.has(entry.key)) {
      throw new ValidationError(`${path}: "${entry.key}" is listed twice.`)
    }
    seen.add(entry.key)

    if (!PLUGIN_KEY_PATTERN.test(entry.key)) {
      throw new ValidationError(
        `${path}: "${entry.key}" is not a valid plugin key. definePlugin requires lower-case ` +
          'letters, digits and hyphens, starting with a letter, 2-40 characters long.',
      )
    }

    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
      throw new ValidationError(
        `${path}: "${entry.key}" has a non-boolean "enabled" (${JSON.stringify(entry.enabled)}). ` +
          'Omit the field to enable the plugin, or set it to true or false.',
      )
    }

    if (!NPM_PACKAGE_NAME_PATTERN.test(entry.package) || entry.package.length > 214) {
      throw new ValidationError(
        `${path}: "${entry.package}" (key "${entry.key}") is not a valid npm package name.`,
      )
    }

    const identifier = toIdentifier(entry.key)
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      throw new ValidationError(
        `${path}: "${entry.key}" is a valid plugin key, but the identifier ` +
          `meith.plugins.ts would bind for it, "${identifier}", is not a valid TypeScript ` +
          'identifier. Each hyphen must be followed by exactly one lower-case letter or digit, ' +
          'and a key cannot end in a hyphen.',
      )
    }

    const collidingKey = identifiers.get(identifier)
    if (collidingKey !== undefined) {
      throw new ValidationError(
        `${path}: "${entry.key}" and "${collidingKey}" both generate the identifier ` +
          `"${identifier}" for meith.plugins.ts. Rename one of the keys so the generated ` +
          'imports do not collide.',
      )
    }
    identifiers.set(identifier, entry.key)
  }
}

async function readManifest(): Promise<Manifest> {
  const path = manifestPath()
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ValidationError(
        `board:eject could not find this build's plugin manifest at ${path}. This command ` +
          'runs inside the official image (docker compose run --rm web community board:eject ' +
          '<dir>), where it is baked in — or, in this repository, against boards/stock. It is ' +
          'not meant to run against a workspace board:eject already produced.',
      )
    }
    throw error
  }

  const parsed = JSON.parse(raw) as Partial<Manifest>
  if (!Array.isArray(parsed.plugins)) {
    throw new ValidationError(`${path} must have a "plugins" array.`)
  }
  validateEjectManifest(parsed.plugins, path)
  return { plugins: parsed.plugins }
}

async function isEmptyOrMissing(target: string): Promise<boolean> {
  try {
    return (await readdir(target)).length === 0
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
}

export function toIdentifier(key: string): string {
  return key.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase())
}

interface EjectedPackageJson {
  dependencies: Record<string, string>
  [key: string]: unknown
}

function mergePluginDependencies(packageJson: string, plugins: readonly ManifestEntry[]): string {
  const parsed = JSON.parse(packageJson) as EjectedPackageJson
  for (const entry of plugins) {
    if (!(entry.package in parsed.dependencies)) {
      parsed.dependencies[entry.package] = CODE_VERSION
    }
  }
  return `${JSON.stringify(parsed, null, 2)}\n`
}

function renderInstalledPluginsModule(plugins: readonly ManifestEntry[]): string {
  const importLines = plugins.map((entry) => {
    const name = toIdentifier(entry.key)
    return `import { messages as ${name}Messages, plugin as ${name}Plugin } from '${entry.package}'`
  })
  const entryLines = plugins.map((entry) => {
    const name = toIdentifier(entry.key)
    const enabled = entry.enabled === false ? 'false' : 'true'
    return (
      `  { key: '${entry.key}', enabled: ${enabled}, ` +
      `plugin: ${name}Plugin, messages: ${name}Messages },`
    )
  })
  const body = entryLines.length > 0 ? `\n${entryLines.join('\n')}\n` : ''

  return `${
    importLines.length > 0 ? `${importLines.join('\n')}\n\n` : ''
  }import type { InstalledPlugin } from '@meith/web/config'

export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = [${body}]

export function installedPluginDefinitions() {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin)
}
`
}

export async function boardEject(args: readonly string[]): Promise<number> {
  const positional = args.filter((arg) => !arg.startsWith('-'))
  const [dir] = positional

  if (dir === undefined || positional.length > 1) {
    throw new ValidationError('Usage: community board:eject <dir>')
  }

  const target = resolve(process.cwd(), dir)
  const name = basename(target)

  const invalidName = validateName(name)
  if (invalidName !== null) {
    throw new ValidationError(
      `board:eject: "${name}" (from ${target}) is not a usable project name — ${invalidName} ` +
        'Pick a target directory whose name is a valid npm package name.',
    )
  }

  if (!(await isEmptyOrMissing(target))) {
    throw new ValidationError(`${target} already exists and is not empty. Pick an empty target.`)
  }

  const manifest = await readManifest()

  const files = new Map(
    scaffold({ name, version: CODE_VERSION, repositoryUrl: DEFAULT_REPOSITORY_URL }),
  )
  const packageJson = files.get('package.json')
  if (packageJson === undefined) {
    throw new Error('scaffold() did not emit package.json')
  }
  files.set('package.json', mergePluginDependencies(packageJson, manifest.plugins))
  files.set('board.plugins.json', `${JSON.stringify({ plugins: manifest.plugins }, null, 2)}\n`)
  files.set('meith.plugins.ts', renderInstalledPluginsModule(manifest.plugins))

  for (const [relative, contents] of files) {
    const path = join(target, relative)
    try {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, contents, 'utf8')
    } catch (error) {
      translateWriteError(error, {
        command: 'board:eject',
        path,
        target,
        reference: 'docs/customization/marketplace.md, "Moving to a custom board"',
      })
    }
  }

  console.log(`Ejected ${files.size} files to ${target}, pinned to meith ${CODE_VERSION}.`)
  console.log('')
  console.log(
    "What doesn't move: the database, the uploads volume and every environment variable " +
      'stay exactly where they are — only where the image comes from changes.',
  )
  console.log('')
  console.log('Next:')
  console.log(`  cd ${target}`)
  console.log('  git init && git add -A && git commit -m "Graduate from the stock image"')
  console.log('  # push it to a new GitHub repository')
  console.log('  # .github/workflows/build.yml builds and pushes the image on every push to main —')
  console.log(
    '  # point Coolify at this repository, on docker-compose.prebuilt.yaml, and set MEITH_IMAGE',
  )
  console.log(
    '  # to the pushed image (or docker-compose.yaml instead, which builds on the server)',
  )
  console.log('  # redeploy — same database, same uploads, same secrets, new image source')
  console.log('')
  console.log(
    'See docs/customization/marketplace.md, "Moving to a custom board", for the full walkthrough.',
  )

  return 0
}
