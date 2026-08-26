import { spawn } from 'node:child_process'
import { join } from 'node:path'

import defaultEnMessages from '../themes/default/src/messages/en.json' with { type: 'json' }
import {
  assertBoardAssetsServe,
  assertMessagesResolve,
  assertStylesResolve,
} from './board-smoke-assets.mts'

export const AT_ROOT_FLAG = '--at-root'
export const AUTH_SECRET = 'smoke-test-auth-secret-32-bytes-min'
export const TICK_SECRET = 'smoke-test-tick-secret-32-bytes-min'

async function waitForResponse(url: string, attempts: number): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw new Error(`board-workspace-smoke: ${url} never answered: ${String(lastError)}`)
}

export async function bootAndCheck(
  boardDir: string,
  port: string,
  atRoot: boolean,
  databaseUrl: string,
) {
  const label = atRoot ? 'at the project root' : 'at .meith/app'
  const flag = atRoot ? [AT_ROOT_FLAG] : []

  console.log(`== forum-web start ${label} ==`)
  const server = spawn(join(boardDir, 'node_modules/.bin/forum-web'), ['start', ...flag], {
    cwd: boardDir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: port,
      DATABASE_URL: databaseUrl,
      DATA_SOURCE: 'postgres',
      AUTH_SECRET,
      TICK_SECRET,
      APP_URL: `http://127.0.0.1:${port}`,
    },
  })
  server.stdout?.on('data', (chunk) => process.stdout.write(chunk))
  server.stderr?.on('data', (chunk) => process.stderr.write(chunk))

  function stopServer() {
    if (server.pid === undefined) return
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {}
    setTimeout(() => {
      if (server.pid === undefined) return
      try {
        process.kill(-server.pid, 'SIGKILL')
      } catch {}
    }, 5000).unref()
  }

  try {
    console.log('== waiting for it to answer / ==')
    const response = await waitForResponse(`http://127.0.0.1:${port}/`, 40)
    if (!response.ok) {
      throw new Error(`board-workspace-smoke: / answered ${response.status} (${label})`)
    }
    const body = await response.text()
    if (!body.includes('<main')) {
      throw new Error(`board-workspace-smoke: / answered but did not render <main> (${label})`)
    }
    assertMessagesResolve(body, Object.keys(defaultEnMessages))
    console.log(`== the board materialized ${label} rendered / ==`)

    console.log('== confirming static assets and /sw.js actually serve ==')
    await assertBoardAssetsServe(`http://127.0.0.1:${port}`, body)
    console.log('== static assets and /sw.js served correctly ==')

    console.log('== confirming the stylesheet actually styles what rendered ==')
    await assertStylesResolve(`http://127.0.0.1:${port}`, body)
    console.log('== every class the board rendered has a rule ==')
  } finally {
    stopServer()
  }
}
