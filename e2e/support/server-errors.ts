import type { FullResult, Reporter } from '@playwright/test/reporter'

// Nothing asserted on what the board logged while a test drove it, so a page
// that threw behind a correct-looking response read as a pass. Playwright routes
// web-server output through the reporter, so this watches it and fails the run.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

const PREFIX = '[WebServer] '

// `⨯` is how Next marks an error it did not expect to handle.
const MARKERS = [/^⨯/, /unhandledRejection/i, /UnhandledPromiseRejection/]

const CONTEXT_LINES = 3

export default class ServerErrorReporter implements Reporter {
  private partial = ''
  private context = 0
  private current: string[] | null = null

  // Keyed by the error and its first frames: one page throwing on every visit
  // is one thing to fix, not forty-six, and reporting it forty-six times over
  // is the wall of noise this exists to answer.
  private readonly seen = new Map<string, number>()

  onStdOut(chunk: string | Buffer): void {
    this.consume(chunk)
  }

  onStdErr(chunk: string | Buffer): void {
    this.consume(chunk)
  }

  async onEnd(): Promise<{ status: FullResult['status'] } | undefined> {
    if (this.partial !== '') this.inspect(this.partial)
    this.close()

    if (this.seen.size === 0) return undefined

    const total = [...this.seen.values()].reduce((sum, count) => sum + count, 0)
    const errors = [...this.seen].map(([entry, count]) =>
      count === 1 ? entry : `${entry}\n    — and ${count - 1} more like it`,
    )

    console.error(
      [
        '',
        `The board logged ${total} unhandled server ${total === 1 ? 'error' : 'errors'} while the suite ran:`,
        '',
        errors.join('\n\n'),
        '',
        'Each one is a request the board could not serve. A test that passes over',
        'the top of one is asserting on the wrong thing.',
        '',
      ].join('\n'),
    )

    return { status: 'failed' }
  }

  private consume(chunk: string | Buffer): void {
    const lines = (this.partial + chunk.toString()).split('\n')
    this.partial = lines.pop() ?? ''
    for (const line of lines) this.inspect(line)
  }

  private inspect(raw: string): void {
    const line = raw.replace(ANSI, '')
    if (!line.startsWith(PREFIX)) return

    const message = line.slice(PREFIX.length).trim()

    if (MARKERS.some((marker) => marker.test(message))) {
      this.close()
      this.current = [message]
      this.context = CONTEXT_LINES
      return
    }

    if (this.current === null || this.context === 0 || message === '') return

    this.context -= 1
    this.current.push(`    ${message}`)
    if (this.context === 0) this.close()
  }

  private close(): void {
    if (this.current === null) return

    const entry = this.current.join('\n')
    this.seen.set(entry, (this.seen.get(entry) ?? 0) + 1)
    this.current = null
  }
}
