import { access, readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const found = new Map<string, string>()

const cacheKey = (specifier: string, from: string) => `${from}\u0000${specifier}`

export function moduleFile(metaUrl: unknown, filename: unknown): string | undefined {
  if (typeof metaUrl === 'string' && metaUrl.startsWith('file:')) return fileURLToPath(metaUrl)
  return typeof filename === 'string' && filename !== '' ? filename : undefined
}

function ownRequire(): NodeRequire | undefined {
  try {
    const here = moduleFile(
      import.meta.url,
      typeof __filename === 'string' ? __filename : undefined,
    )
    return here === undefined ? undefined : createRequire(here)
  } catch {
    return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function storePrefix(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? `${parts[0]}+${parts[1]}@` : `${parts[0]}@`
}

function ancestors(from: string): string[] {
  const root = parse(from).root
  const chain: string[] = []
  let current = from
  while (true) {
    chain.push(current)
    if (current === root) return chain
    const next = dirname(current)
    if (next === current) return chain
    current = next
  }
}

async function candidatesUnder(nodeModules: string, specifier: string): Promise<string[]> {
  const paths = [join(nodeModules, specifier)]

  const prefix = storePrefix(specifier)
  let entries: string[]
  try {
    entries = await readdir(join(nodeModules, '.pnpm'))
  } catch {
    return paths
  }

  for (const entry of entries
    .filter((e) => e.startsWith(prefix))
    .sort()
    .reverse()) {
    paths.push(join(nodeModules, '.pnpm', entry, 'node_modules', specifier))
  }
  return paths
}

export async function locateAsset(specifier: string, from = process.cwd()): Promise<string> {
  const key = cacheKey(specifier, from)
  const cached = found.get(key)
  if (cached !== undefined) return cached

  const required = ownRequire()
  if (required !== undefined) {
    try {
      const path = required.resolve(specifier)
      found.set(key, path)
      return path
    } catch {
      /* ignore */
    }
  }

  for (const dir of ancestors(from)) {
    for (const candidate of await candidatesUnder(join(dir, 'node_modules'), specifier)) {
      if (await exists(candidate)) {
        found.set(key, candidate)
        return candidate
      }
    }
  }

  throw new Error(
    `Could not find "${specifier}" in any node_modules above ${from}. ` +
      'The deployment did not copy the package — check `serverExternalPackages`.',
  )
}

export async function compileAsset(specifier: string): Promise<WebAssembly.Module> {
  const path = await locateAsset(specifier)
  return WebAssembly.compile(await readFile(/* turbopackIgnore: true */ path))
}
