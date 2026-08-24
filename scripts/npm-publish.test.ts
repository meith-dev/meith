import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  binTargets,
  missingTarballContents,
  orderByDependency,
  requiredTarballPrefixes,
  tarballEntriesFrom,
} from './npm-publish.mjs'

describe('orderByDependency', () => {
  it('puts a dependency before the dependent that names it', () => {
    const ordered = orderByDependency([
      { name: '@meith/web', manifest: { dependencies: { '@meith/core': 'workspace:*' } } },
      { name: '@meith/core', manifest: {} },
    ])
    expect(ordered.map((entry) => entry.name)).toEqual(['@meith/core', '@meith/web'])
  })

  it('ignores a dependency that is not itself publishing', () => {
    const ordered = orderByDependency([
      { name: '@meith/web', manifest: { dependencies: { next: '16.3.1' } } },
    ])
    expect(ordered.map((entry) => entry.name)).toEqual(['@meith/web'])
  })

  it('breaks ties alphabetically so the order is deterministic', () => {
    const ordered = orderByDependency([
      { name: '@meith/ui', manifest: {} },
      { name: '@meith/core', manifest: {} },
    ])
    expect(ordered.map((entry) => entry.name)).toEqual(['@meith/core', '@meith/ui'])
  })

  it('throws, naming every package involved, on a dependency cycle', () => {
    expect(() =>
      orderByDependency([
        { name: '@meith/a', manifest: { dependencies: { '@meith/b': 'workspace:*' } } },
        { name: '@meith/b', manifest: { dependencies: { '@meith/a': 'workspace:*' } } },
      ]),
    ).toThrowError(/dependency cycle among @meith\/a, @meith\/b/)
  })
})

describe('requiredTarballPrefixes', () => {
  it('takes the top-level component of every files entry', () => {
    expect(
      requiredTarballPrefixes({
        files: ['bin', 'app', 'src', 'next.config.mjs', '!src/**/*.test.*'],
      }),
    ).toEqual(['app', 'bin', 'next.config.mjs', 'src'])
  })

  it('drops negated entries entirely — they are exclusions, not requirements', () => {
    expect(requiredTarballPrefixes({ files: ['src', '!src/**/*.test.*'] })).toEqual(['src'])
  })

  it('is empty when there is no files allowlist', () => {
    expect(requiredTarballPrefixes({})).toEqual([])
  })
})

describe('binTargets', () => {
  it('normalises a leading ./ off every bin target', () => {
    expect(binTargets({ bin: { 'forum-web': './bin/forum-web.mjs' } })).toEqual([
      'bin/forum-web.mjs',
    ])
  })

  it('is empty when there is no bin field', () => {
    expect(binTargets({})).toEqual([])
  })
})

describe('missingTarballContents', () => {
  const webManifest = {
    files: ['bin', 'app', 'src', 'next.config.mjs'],
    bin: { 'forum-web': './bin/forum-web.mjs' },
  }

  it('is clean when every files entry and every bin target is present', () => {
    const problems = missingTarballContents(webManifest, [
      'package.json',
      'bin/forum-web.mjs',
      'app/layout.tsx',
      'src/config.ts',
      'next.config.mjs',
    ])
    expect(problems).toEqual([])
  })

  it('flags the exact failure mode this exists for — a files entry with nothing packed under it', () => {
    // "app" is promised by the files allowlist, but the tarball never
    // received anything under it — the Next app directory going missing
    // without anything else about the package looking wrong.
    const problems = missingTarballContents(webManifest, [
      'package.json',
      'bin/forum-web.mjs',
      'src/config.ts',
      'next.config.mjs',
    ])
    expect(problems).toEqual([
      '"app" is in the files allowlist, but nothing under it is in the tarball',
    ])
  })

  it('flags a bin target that files coverage alone would not catch', () => {
    // Everything under bin/ is present, but not the exact file the bin entry
    // points at — a rename on one side and not the other.
    const problems = missingTarballContents(webManifest, [
      'package.json',
      'bin/forum-web-old.mjs',
      'app/layout.tsx',
      'src/config.ts',
      'next.config.mjs',
    ])
    expect(problems).toEqual(['the bin target "bin/forum-web.mjs" is not a file in the tarball'])
  })

  it('accepts a bare-filename files entry matched exactly, not as a directory prefix', () => {
    expect(missingTarballContents({ files: ['next.config.mjs'] }, ['next.config.mjs'])).toEqual([])
  })
})

describe('tarballEntriesFrom', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('strips the package/ root and drops directory entries', async () => {
    dir = await mkdtemp(join(tmpdir(), 'npm-publish-tarball-'))
    const src = join(dir, 'package')
    execFileSync('mkdir', ['-p', join(src, 'bin')])
    execFileSync('sh', ['-c', `echo hi > ${join(src, 'package.json')}`])
    execFileSync('sh', ['-c', `echo hi > ${join(src, 'bin', 'tool.mjs')}`])
    const tarball = join(dir, 'out.tgz')
    execFileSync('tar', ['-czf', tarball, '-C', dir, 'package'])

    expect(tarballEntriesFrom(tarball).sort()).toEqual(['bin/tool.mjs', 'package.json'])
  })
})
