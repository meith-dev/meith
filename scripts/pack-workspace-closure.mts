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
