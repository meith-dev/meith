import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export interface TestRedis {
  readonly socketPath: string
  close(): Promise<void>
}

export function redisServerAvailable(): boolean {
  return spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0
}

export async function startTestRedis(): Promise<TestRedis> {
  const dir = await mkdtemp(join(tmpdir(), 'meith-redis-'))
  const socketPath = join(dir, 'redis.sock')

  const server: ChildProcess = spawn(
    'redis-server',
    ['--port', '0', '--unixsocket', socketPath, '--save', '', '--appendonly', 'no'],
    { stdio: 'ignore' },
  )

  const deadline = Date.now() + 10_000
  while (!existsSync(socketPath)) {
    if (server.exitCode !== null) {
      throw new Error(`redis-server exited with code ${server.exitCode} before listening`)
    }
    if (Date.now() > deadline) {
      server.kill('SIGKILL')
      throw new Error('redis-server did not open its unix socket within 10s')
    }
    await sleep(25)
  }

  return {
    socketPath,
    async close(): Promise<void> {
      server.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        if (server.exitCode !== null) return resolve()
        server.once('exit', () => resolve())
      })
      await rm(dir, { recursive: true, force: true })
    },
  }
}
