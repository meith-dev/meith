import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'

const ENV_FILES = ['.env.local', '.env'] as const

const ROOT_MARKER = 'pnpm-workspace.yaml'

export interface LoadedEnvFiles {
  readonly root: string | undefined
  readonly loaded: readonly string[]
}

export function findWorkspaceRoot(from: string): string | undefined {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, ROOT_MARKER))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function loadEnvFiles(from: string = process.cwd()): LoadedEnvFiles {
  const root = findWorkspaceRoot(from)
  if (root === undefined) return { root: undefined, loaded: [] }

  const loaded: string[] = []
  for (const name of ENV_FILES) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    process.loadEnvFile(path)
    loaded.push(name)
  }
  return { root, loaded }
}
