import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

export default class FlakyNoticeReporter implements Reporter {
  private readonly flaky = new Set<string>()

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'passed' || result.retry === 0) return
    this.flaky.add(test.titlePath().slice(1).filter(Boolean).join(' › '))
  }

  onEnd(): void {
    if (this.flaky.size === 0) return

    for (const title of this.flaky) {
      process.stdout.write(
        `::warning title=Flaky browser test::${title} — failed, then passed on retry\n`,
      )
    }

    console.error(
      [
        '',
        `${this.flaky.size} browser ${this.flaky.size === 1 ? 'test' : 'tests'} only passed on a retry:`,
        '',
        [...this.flaky].map((title) => `  ${title}`).join('\n'),
        '',
        'The shard is green because the retry passed, not because the run was clean.',
        'docs/contributing/development.md explains what a retried browser test means, and why a red',
        'browser shard is often not the fault of the change under test.',
        '',
      ].join('\n'),
    )
  }
}
