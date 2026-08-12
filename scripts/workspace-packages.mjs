#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

export const WORKSPACE_GLOBS = ['apps', 'packages', 'themes', 'plugins', 'examples']

export async function workspaceEntries(root = ROOT) {
  const entries = []

  for (const glob of WORKSPACE_GLOBS) {
    let directories
    try {
      directories = await readdir(join(root, glob), { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of directories) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue

      const dir = `${glob}/${entry.name}`
      let manifest
      try {
        manifest = JSON.parse(await readFile(join(root, dir, 'package.json'), 'utf8'))
      } catch {
        entries.push({ dir, manifest: null })
        continue
      }

      entries.push({ dir, manifest })
    }
  }

  return entries
}

export async function workspacePackages(root = ROOT) {
  return (await workspaceEntries(root)).filter((entry) => entry.manifest !== null)
}
