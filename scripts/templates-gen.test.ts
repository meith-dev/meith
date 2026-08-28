import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  differences,
  readTree,
  renderTemplate,
  scaffoldOptionsFor,
  TEMPLATE_BOARD_NAME,
  TEMPLATES,
} from './templates-gen.mts'
import { ROOT } from './workspace-packages.mjs'

async function rootVersion(): Promise<string> {
  return JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version as string
}

describe('what the generator asks the scaffold for', () => {
  it('covers the self-host and vercel targets, and nothing else', () => {
    expect(TEMPLATES.map((entry) => entry.target)).toEqual(['self-host', 'vercel'])
    expect(TEMPLATES.map((entry) => entry.dir)).toEqual(['templates/self-host', 'templates/vercel'])
  })

  it('names the repository each target is published to', () => {
    expect(TEMPLATES.map((entry) => entry.repo)).toEqual([
      'meith-dev/template',
      'meith-dev/vercel-template',
    ])
  })

  it('asks for each target under a fixed board name', () => {
    for (const { target } of TEMPLATES) {
      const options = scaffoldOptionsFor(target, '1.2.3')
      expect(options.target).toBe(target)
      expect(options.name).toBe(TEMPLATE_BOARD_NAME)
    }
  })

  it('pins every @meith dependency to the version it was given, in both targets', () => {
    for (const { target } of TEMPLATES) {
      const manifest = JSON.parse(renderTemplate(target, '1.2.3').get('package.json') ?? '{}')
      for (const [name, range] of Object.entries(manifest.dependencies)) {
        if (!name.startsWith('@meith/')) continue
        expect(range).toBe('1.2.3')
      }
    }
  })

  it('gives self-host a Dockerfile and vercel a vercel.json, not the other way round', () => {
    const selfHost = renderTemplate('self-host', '1.2.3')
    const vercel = renderTemplate('vercel', '1.2.3')

    expect(selfHost.has('Dockerfile')).toBe(true)
    expect(selfHost.has('vercel.json')).toBe(false)
    expect(vercel.has('vercel.json')).toBe(true)
    expect(vercel.has('Dockerfile')).toBe(false)
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

describe('the committed template trees', () => {
  it('are exactly what the generator writes at the version each tree is on', async () => {
    const version = await rootVersion()
    for (const { target, dir } of TEMPLATES) {
      const expected = renderTemplate(target, version)
      const actual = await readTree(join(ROOT, dir))

      expect(differences(expected, actual)).toEqual([])
    }
  })

  it('pins the published packages to that same version, so a release moves them', async () => {
    const version = await rootVersion()
    for (const { dir } of TEMPLATES) {
      const manifest = JSON.parse(await readFile(join(ROOT, dir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
      }

      expect(manifest.dependencies['@meith/web']).toBe(version)
      expect(manifest.dependencies['@meith/cli']).toBe(version)
      expect(manifest.dependencies['@meith/theme-default']).toBe(version)
    }
  })

  it('carries a vercel.json that parses, with the cron entry and the build command', async () => {
    const config = JSON.parse(await readFile(join(ROOT, 'templates/vercel', 'vercel.json'), 'utf8'))

    expect(config.crons).toEqual([{ path: '/api/system/tick', schedule: '0 3 * * *' }])
    expect(config.buildCommand).toBe('community migrate && forum-web build --at-root')
  })
})
