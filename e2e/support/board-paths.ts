import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

function findWorkspaceRoot(): string {
  let at = resolve(process.cwd())

  while (!existsSync(join(at, 'pnpm-workspace.yaml'))) {
    const up = dirname(at)
    if (up === at) throw new Error(`no pnpm-workspace.yaml at or above ${process.cwd()}`)
    at = up
  }
  return at
}

export const WORKSPACE_ROOT = findWorkspaceRoot()

export const APP_DIR = join(WORKSPACE_ROOT, 'apps', 'community')

export const DIST_DIR = '.next-e2e'

export function standaloneRoot(): string {
  return join(APP_DIR, DIST_DIR, 'standalone')
}

export function standaloneAppDir(): string {
  return join(standaloneRoot(), relative(WORKSPACE_ROOT, APP_DIR))
}

export function standaloneServer(): string {
  return join(standaloneAppDir(), 'server.js')
}
