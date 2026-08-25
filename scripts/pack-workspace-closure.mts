/**
 * Shared by every script that needs a real, installable stand-in for
 * `@meith/*` packages that are not (yet, or ever, in CI) on the real npm
 * registry: `pnpm pack` (the same tool `scripts/npm-publish.mjs` uses for a
 * real release, which rewrites `workspace:*` ranges into real ones) every
 * workspace package a set of root packages needs, transitively, through
 * their own `dependencies`/`peerDependencies`.
 *
 * Extracted from scripts/board-workspace-smoke.mts (MEI-75) when
 * scripts/board-deploy-kit-smoke.mts (MEI-77) needed the identical closure
 * walk starting from a different, slightly larger root set — packing a
 * plugin on top of the board closure to stand in for "an operator adds a
 * plugin".
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { ROOT, workspacePackages } from './workspace-packages.mjs'

export function safeName(name: string): string {
  return name.replace('@', '').replace('/', '-')
}

function run(command: string, args: readonly string[], cwd: string) {
  console.log(`$ ${command} ${args.join(' ')}  (in ${cwd})`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? result.signal}`)
  }
}

/**
 * Packs `roots` and every `@meith/*` package they depend on, transitively,
 * into `tarballDir`, and returns each package name mapped to its tarball's
 * absolute path. Throws if a package in the closure is still `private` —
 * see the message below for why that is a defect in the closure itself
 * rather than something this function can work around.
 *
 * A dependency counts as workspace-internal by whether it names a workspace
 * package, not by a `@meith/` naming convention — MEI-81 added `@meith/cli`'s
 * dependency on the bare-named `create-meith`, which this used to silently
 * drop from the closure (never packed, never overridden), so `npm install`
 * fell through to the real registry looking for a version of `create-meith`
 * that has never been published from a local checkout. Any real third-party
 * dependency (react, zod, …) is absent from `byName` and correctly still
 * resolves from the real registry.
 */
export async function packClosure(
  tarballDir: string,
  roots: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const pkgs = await workspacePackages()
  const byName = new Map(pkgs.map((p) => [p.manifest.name, p]))

  const closure = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.pop()
    if (name === undefined || closure.has(name)) continue
    closure.add(name)
    const entry = byName.get(name)
    if (entry === undefined) throw new Error(`packClosure: no workspace package named ${name}`)
    for (const field of ['dependencies', 'peerDependencies'] as const) {
      for (const dep of Object.keys(entry.manifest[field] ?? {})) {
        if (byName.has(dep)) queue.push(dep)
      }
    }
  }

  const tarballs = new Map<string, string>()
  for (const name of [...closure].sort()) {
    const entry = byName.get(name)
    if (entry === undefined) continue
    if (entry.manifest.private === true) {
      throw new Error(
        `packClosure: ${name} (${entry.dir}) is still private — it is in the dependency ` +
          `closure of ${roots.join(', ')}, so it has to publish.`,
      )
    }
    const out = join(tarballDir, `${safeName(name)}.tgz`)
    run('pnpm', ['pack', '--out', out], join(ROOT, entry.dir))
    tarballs.set(name, out)
  }
  return tarballs
}
