import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_REPOSITORY_URL, scaffold } from '../packages/create-meith/src/scaffold'
import {
  HEREDOC_DELIMITER,
  NAME_PLACEHOLDER,
  renderInstallerScript,
  scaffoldOptionsFor,
} from './board-installer-gen.mts'

const VERSION = '1.2.3'

describe('renderInstallerScript', () => {
  it('refuses a scaffolded file that happens to contain the heredoc delimiter', () => {
    const files = new Map([['README.md', `oops ${HEREDOC_DELIMITER} oops`]])
    expect(() => renderInstallerScript(files)).toThrow(/heredoc delimiter/)
  })

  it('names every scaffolded file and the file count', () => {
    const files = scaffold(scaffoldOptionsFor(VERSION))
    const script = renderInstallerScript(files)
    for (const path of files.keys()) {
      expect(script).toContain(`"$BOARD_NAME/${path}"`)
    }
    expect(script).toContain(`${files.size} files`)
  })
})

describe('the generated script, actually run', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  async function run(args: readonly string[], cwd: string) {
    const script = renderInstallerScript(scaffold(scaffoldOptionsFor(VERSION)))
    const scriptPath = join(cwd, 'create-board.sh')
    await writeFile(scriptPath, script, 'utf8')
    return spawnSync('sh', [scriptPath, ...args], { cwd, encoding: 'utf8' })
  }

  it('writes files byte-for-byte identical to scaffold() itself, for a hyphenated and a dotted name', async () => {
    dir = await mkdtemp(join(tmpdir(), 'board-installer-'))

    for (const name of ['riverside-fencing', 'my.board_2']) {
      const result = await run([name], dir)
      expect(result.status).toBe(0)

      const expected = scaffold({ name, version: VERSION, repositoryUrl: DEFAULT_REPOSITORY_URL })
      for (const [path, content] of expected) {
        const actual = await readFile(join(dir, name, path), 'utf8')
        expect(actual).toBe(content)
      }
    }
  })

  it('never leaves the placeholder token behind', async () => {
    dir = await mkdtemp(join(tmpdir(), 'board-installer-'))
    const result = await run(['a-real-board'], dir)
    expect(result.status).toBe(0)

    const readme = await readFile(join(dir, 'a-real-board/README.md'), 'utf8')
    expect(readme).not.toContain(NAME_PLACEHOLDER)
    expect(readme).toContain('a-real-board')
  })

  it('initializes a git repository and stages every file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'board-installer-'))
    const result = await run(['my-board'], dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Initialized a git repository')

    const head = await readFile(join(dir, 'my-board/.git/HEAD'), 'utf8')
    expect(head.trim()).toBe('ref: refs/heads/main')
  })

  it('fails with a message when the name is missing', async () => {
    dir = await mkdtemp(join(tmpdir(), 'board-installer-'))
    const result = await run([], dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('a board name is required')
  })

  it('refuses a name with characters outside the allowed set', async () => {
    dir = await mkdtemp(join(tmpdir(), 'board-installer-'))
    const result = await run(['My Board!'], dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/lower-case letters/)
  })

  it('refuses a directory that already exists and is not empty', async () => {
    dir = await mkdtemp(join(tmpdir(), 'board-installer-'))
    const first = await run(['my-board'], dir)
    expect(first.status).toBe(0)

    const second = await run(['my-board'], dir)
    expect(second.status).toBe(1)
    expect(second.stderr).toMatch(/already exists and is not empty/)
  })
})
