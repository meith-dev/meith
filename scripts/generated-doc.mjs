#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT } from './workspace-packages.mjs'

export async function emitGeneratedDoc({
  outputFile,
  generated,
  staleReason,
  upToDate,
  wrote,
  root = ROOT,
}) {
  const target = join(root, outputFile)

  if (!process.argv.includes('--check')) {
    await writeFile(target, generated, 'utf8')
    console.log(`Wrote ${outputFile} — ${wrote}.`)
    return
  }

  const current = await readFile(target, 'utf8').catch(() => '')

  if (current === generated) {
    console.log(`${outputFile} is up to date (${upToDate}).`)
    return
  }

  console.error(`${outputFile} is out of date.\n\n${staleReason}\n`)

  if (current === '') {
    console.error('(The file does not exist yet.)')
  } else {
    const a = current.split('\n')
    const b = generated.split('\n')
    const at = a.findIndex((line, i) => line !== b[i])
    console.error(`First difference at line ${at + 1}:`)
    console.error(`  on disk:   ${a[at] ?? '(end of file)'}`)
    console.error(`  generated: ${b[at] ?? '(end of file)'}`)
  }

  process.exit(1)
}
