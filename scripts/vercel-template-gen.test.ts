import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  differences,
  OUTPUT_DIR,
  readTree,
  renderVercelTemplate,
  scaffoldOptionsFor,
  TEMPLATE_BOARD_NAME,
} from './vercel-template-gen.mts'
import { ROOT } from './workspace-packages.mjs'

async function rootVersion(): Promise<string> {
  return JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version as string
}

describe('what the generator asks the scaffold for', () => {
  it('asks for the Vercel target, under a fixed board name', () => {
    const options = scaffoldOptionsFor('1.2.3')
    expect(options.target).toBe('vercel')
    expect(options.name).toBe(TEMPLATE_BOARD_NAME)
  })

  it('pins every @meith dependency to the version it was given', () => {
    const manifest = JSON.parse(renderVercelTemplate('1.2.3').get('package.json') ?? '{}')
    for (const [name, range] of Object.entries(manifest.dependencies)) {
      if (!name.startsWith('@meith/')) continue
      expect(range).toBe('1.2.3')
    }
  })
})

describe('differences', () => {
  const expected = new Map([['a.txt', 'one']])

  it('reports a file the tree does not have', () => {
    expect(differences(expected, new Map())).toEqual(['a.txt is missing'])
  })

  it('reports a file whose contents drifted', () => {
    expect(differences(expected, new Map([['a.txt', 'two']]))).toEqual(['a.txt differs'])
  })

  it('reports a file the generator has stopped writing', () => {
    const actual = new Map([
      ['a.txt', 'one'],
      ['b.txt', 'stale'],
    ])
    expect(differences(expected, actual)).toEqual(['b.txt is not generated any more'])
  })

  it('says nothing when the tree matches', () => {
    expect(differences(expected, new Map([['a.txt', 'one']]))).toEqual([])
  })
})

describe('the committed template tree', () => {
  it('is exactly what the generator writes at the version this tree is on', async () => {
    const expected = renderVercelTemplate(await rootVersion())
    const actual = await readTree(join(ROOT, OUTPUT_DIR))

    expect(differences(expected, actual)).toEqual([])
  })

  it('pins the published packages to that same version, so a release moves them', async () => {
    const version = await rootVersion()
    const manifest = JSON.parse(await readFile(join(ROOT, OUTPUT_DIR, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }

    expect(manifest.dependencies['@meith/web']).toBe(version)
    expect(manifest.dependencies['@meith/cli']).toBe(version)
    expect(manifest.dependencies['@meith/theme-default']).toBe(version)
  })

  it('carries a vercel.json that parses, with the cron entry and the build command', async () => {
    const config = JSON.parse(await readFile(join(ROOT, OUTPUT_DIR, 'vercel.json'), 'utf8'))

    expect(config.crons).toEqual([{ path: '/api/system/tick', schedule: '0 3 * * *' }])
    expect(config.buildCommand).toBe('community migrate && forum-web build --at-root')
  })
})
