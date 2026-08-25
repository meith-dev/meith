#!/usr/bin/env node
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

export const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.turbo',
  'coverage',
  'v0_plans',
  'user_read_only_context',
  '.claude',
  '.meith',
])

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(join(dir, e.name), out)
    } else if (e.isFile()) {
      out.push(join(dir, e.name))
    }
  }
  return out
}

export async function repoFiles() {
  const absolute = await walk(ROOT)
  return absolute.map((abs) => ({ abs, rel: relative(ROOT, abs) }))
}
