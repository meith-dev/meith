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

const SERVER_BINARIES = ['valkey-server', 'redis-server'] as const

function serverBinary(): string | null {
  for (const binary of SERVER_BINARIES) {
    if (spawnSync(binary, ['--version'], { stdio: 'ignore' }).status === 0) return binary
  }
  return null
}

export function redisServerAvailable(): boolean {
  return serverBinary() !== null
}

export async function startTestRedis(): Promise<TestRedis> {
  const binary = serverBinary()
  if (binary === null) {
    throw new Error(`none of ${SERVER_BINARIES.join(', ')} is installed`)
  }

  const dir = await mkdtemp(join(tmpdir(), 'meith-redis-'))
  const socketPath = join(dir, 'redis.sock')

  const server: ChildProcess = spawn(
    binary,
    ['--port', '0', '--unixsocket', socketPath, '--save', '', '--appendonly', 'no'],
    { stdio: 'ignore' },
  )

  const deadline = Date.now() + 10_000
  while (!existsSync(socketPath)) {
    if (server.exitCode !== null) {
      throw new Error(`${binary} exited with code ${server.exitCode} before listening`)
    }
    if (Date.now() > deadline) {
      server.kill('SIGKILL')
      throw new Error(`${binary} did not open its unix socket within 10s`)
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
