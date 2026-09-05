#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

export const WORKSPACE_GLOBS = ['apps', 'boards', 'packages', 'themes', 'plugins', 'examples']

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

export async function pluginDefinitionSites(root = ROOT) {
  const sites = []

  let directories
  try {
    directories = await readdir(join(root, 'plugins'), { withFileTypes: true })
  } catch {
    return sites
  }

  for (const entry of directories) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const dir = join(root, 'plugins', entry.name, 'src')
    let sources
    try {
      sources = (await readdir(dir)).filter(
        (name) => /\.tsx?$/.test(name) && !name.includes('.test.'),
      )
    } catch {
      continue
    }

    let found = null
    for (const name of sources.sort()) {
      const file = `plugins/${entry.name}/src/${name}`
      const source = await readFile(join(root, file), 'utf8')
      if (!source.includes('definePlugin(')) continue
      if (!/\n\s*version: '[^']+'/.test(source)) continue
      found = file
      break
    }

    if (found === null) {
      throw new Error(
        `plugins/${entry.name} declares no definePlugin version that release tooling can read`,
      )
    }

    sites.push(found)
  }

  return sites.sort()
}

export async function themeDefinitionSites(root = ROOT) {
  const sites = []

  let directories
  try {
    directories = await readdir(join(root, 'themes'), { withFileTypes: true })
  } catch {
    return sites
  }

  for (const entry of directories) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const dir = join(root, 'themes', entry.name, 'src')
    let sources
    try {
      sources = (await readdir(dir)).filter(
        (name) => /\.tsx?$/.test(name) && !name.includes('.test.'),
      )
    } catch {
      continue
    }

    for (const name of sources.sort()) {
      const file = `themes/${entry.name}/src/${name}`
      const source = await readFile(join(root, file), 'utf8')
      if (!source.includes('defineTheme(')) continue
      if (!/\n\s*version: '[^']+'/.test(source)) continue
      sites.push(file)
      break
    }
  }

  return sites.sort()
}
