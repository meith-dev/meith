import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'

import { APP_DIR, DIST_DIR, standaloneAppDir, standaloneServer } from './board-paths'

function build(): void {
  const result = spawnSync('pnpm', ['--filter', '@meith/web', 'run', 'build'], {
    cwd: APP_DIR,
    stdio: 'inherit',
    // biome-ignore lint/style/noProcessEnv: next.config.mjs reads FORUM_DIST_DIR from the environment
    env: { ...process.env, FORUM_DIST_DIR: DIST_DIR, NEXT_TELEMETRY_DISABLED: '1' },
  })

  if (result.status !== 0) {
    throw new Error(`next build failed with status ${String(result.status)}`)
  }
}

function stage(): void {
  const target = standaloneAppDir()

  const staticTarget = `${target}/${DIST_DIR}/static`
  rmSync(staticTarget, { recursive: true, force: true })
  cpSync(`${APP_DIR}/${DIST_DIR}/static`, staticTarget, { recursive: true })

  const publicTarget = `${target}/public`
  rmSync(publicTarget, { recursive: true, force: true })
  if (existsSync(`${APP_DIR}/public`)) {
    cpSync(`${APP_DIR}/public`, publicTarget, { recursive: true })
  }
}

build()
stage()

if (!existsSync(standaloneServer())) {
  throw new Error(`the build left no standalone server at ${standaloneServer()}`)
}

// biome-ignore lint/suspicious/noConsole: this is a process; its output is its status
console.log(`board built for the browser suite: ${standaloneServer()}`)
