import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { compileAsset, locateAsset, moduleFile } from './locate-wasm'

const SPEC = '@fake/png/codec/pkg/fake_bg.wasm'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'locate-wasm-'))
  roots.push(root)
  return root
}

async function put(root: string, relative: string, body = 'x'): Promise<string> {
  const path = join(root, relative)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, body)
  return path
}

describe('the plain layout', () => {
  it('finds a file under node_modules beside the starting point', async () => {
    const root = await tree()
    const expected = await put(root, `node_modules/${SPEC}`)

    expect(await locateAsset(SPEC, root)).toBe(expected)
  })

  it('walks up to find it in an ancestor', async () => {
    const root = await tree()
    const expected = await put(root, `node_modules/${SPEC}`)
    const deep = join(root, 'apps', 'community')
    await mkdir(deep, { recursive: true })

    expect(await locateAsset(SPEC, deep)).toBe(expected)
  })

  it('prefers the nearest node_modules', async () => {
    const root = await tree()
    await put(root, `node_modules/${SPEC}`, 'far')
    const near = await put(root, `apps/community/node_modules/${SPEC}`, 'near')

    expect(await locateAsset(SPEC, join(root, 'apps', 'community'))).toBe(near)
  })
})

describe('the pnpm store layout', () => {
  it('finds a file with no top-level link at all', async () => {
    const root = await tree()
    const expected = await put(
      root,
      `node_modules/.pnpm/@fake+png@3.1.1/node_modules/${SPEC}`,
    )

    expect(await locateAsset(SPEC, root)).toBe(expected)
  })

  it('matches the version by prefix, so an upgrade still resolves', async () => {
    const root = await tree()
    const expected = await put(
      root,
      `node_modules/.pnpm/@fake+png@99.0.0-rc.1/node_modules/${SPEC}`,
    )

    expect(await locateAsset(SPEC, root)).toBe(expected)
  })

  it('does not match a package whose name merely starts the same', async () => {
    const root = await tree()
    await put(root, 'node_modules/.pnpm/@fake+png-extra@1.0.0/node_modules/@fake/png-extra/codec/pkg/fake_bg.wasm')

    await expect(locateAsset(SPEC, root)).rejects.toThrow(/Could not find/)
  })

  it('takes the highest version when two are present', async () => {
    const root = await tree()
    await put(root, `node_modules/.pnpm/@fake+png@2.0.0/node_modules/${SPEC}`, 'old')
    const newer = await put(
      root,
      `node_modules/.pnpm/@fake+png@3.1.1/node_modules/${SPEC}`,
      'new',
    )

    expect(await locateAsset(SPEC, root)).toBe(newer)
  })

  it('prefers a top-level link over the store', async () => {
    const root = await tree()
    const linked = await put(root, `node_modules/${SPEC}`)
    await put(root, `node_modules/.pnpm/@fake+png@3.1.1/node_modules/${SPEC}`)

    expect(await locateAsset(SPEC, root)).toBe(linked)
  })
})

describe('an unscoped package', () => {
  it('resolves in both layouts', async () => {
    const spec = 'plain/lib/thing.wasm'
    const root = await tree()
    const expected = await put(root, `node_modules/.pnpm/plain@1.2.3/node_modules/${spec}`)

    expect(await locateAsset(spec, root)).toBe(expected)
  })
})

describe('when it is not there', () => {
  it('throws naming the specifier and where it looked', async () => {
    const root = await tree()

    await expect(locateAsset(SPEC, root)).rejects.toThrow(
      new RegExp(`${SPEC.replace(/[/+@.]/g, '\\$&')}[\\s\\S]*${root}`),
    )
  })
})

describe('moduleFile', () => {
  const here = join('/repo', 'packages', 'drivers', 'src', 'images', 'locate-wasm.ts')

  it('takes the ESM location, which is this module rather than a bundle', () => {
    expect(moduleFile(pathToFileURL(here).href, '/app/apps/worker/worker.cjs')).toBe(here)
  })

  it('takes __filename when import.meta is the empty object esbuild leaves in cjs', () => {
    const bundle = join('/app', 'apps', 'worker', 'worker.cjs')

    expect(moduleFile(undefined, bundle)).toBe(bundle)
  })

  it('ignores a location that is not a file: URL, such as a bundle served over http', () => {
    expect(moduleFile('https://example.test/worker.js', undefined)).toBeUndefined()
  })

  it('has nothing to offer when neither exists, so the caller walks up from cwd', () => {
    expect(moduleFile(undefined, undefined)).toBeUndefined()
    expect(moduleFile(undefined, '')).toBeUndefined()
  })
})

describe('compileAsset', () => {
  it('compiles the codec modules this board actually ships', async () => {
    for (const spec of [
      '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
      '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
      '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
      '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm',
    ]) {
      expect(await compileAsset(spec)).toBeInstanceOf(WebAssembly.Module)
    }
  }, 30_000)
})
