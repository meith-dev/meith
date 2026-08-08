/**
 * F49's service, at the point F55 changed it.
 *
 * The report rules themselves are proven against real Postgres in
 * `packages/db/src/report-repo.test.ts` — the duplicate guard is an index, the
 * scope is a predicate, and neither means anything over a fake. What is here is
 * the decision this feature added: **who gets told when a report is closed, and
 * what they are told.**
 *
 * D48's whole argument is that a report has two audiences and almost every
 * decision keeps them apart, so the tests that matter are the ones about the
 * boundary between them.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { ReportService } from './reports'
import type {
  ReportEvent,
  ReportRepository,
  ReportRow,
  ReportScope,
} from './reports'

const NOW = new Date('2026-07-31T12:00:00Z')
const SCOPE: ReportScope = { forumIds: [10], global: true }

const REPORT: ReportRow = {
  id: 3,
  kind: 'post',
  targetId: 50,
  forumId: 10,
  threadId: 20,
  targetLabel: 'A post by ivan',
  reporterUserId: 7,
  reporterUsername: 'reporter',
  reason: 'spam',
  status: 'open',
  assignedToUserId: null,
  assignedToUsername: null,
  createdAt: NOW,
}

class FakeReports implements ReportRepository {
  report: ReportRow | null = REPORT
  closed = true

  async resolveTarget() {
    return null
  }
  async open() {
    return 1
  }
  async listOpen() {
    return { rows: [] }
  }
  async countOpen() {
    return 0
  }
  async find(): Promise<{ report: ReportRow; events: readonly ReportEvent[] } | null> {
    return this.report === null ? null : { report: this.report, events: [] }
  }
  async assign() {
    return true
  }
  async close() {
    return this.closed
  }
}

function recordingNotifier() {
  const told: unknown[] = []
  return {
    told,
    reportClosed: async (input: unknown) => {
      told.push(input)
    },
  }
}

let reports: FakeReports

beforeEach(() => {
  reports = new FakeReports()
})

function service(notifier: ReturnType<typeof recordingNotifier> | null) {
  return new ReportService({ reports, notifier, now: () => NOW })
}

describe('closing a report', () => {
  it('tells the reporter the outcome', async () => {
    const notifier = recordingNotifier()

    await service(notifier).close({
      reportId: 3,
      status: 'resolved',
      note: 'Deleted and warned.',
      actorUserId: 9,
      scope: SCOPE,
    })

    expect(notifier.told).toEqual([
      {
        reporterUserId: 7,
        reportId: 3,
        outcome: 'resolved',
        targetLabel: 'A post by ivan',
      },
    ])
  })

  it('never carries the moderator’s private note', async () => {
    const notifier = recordingNotifier()

    await service(notifier).close({
      reportId: 3,
      status: 'rejected',
      note: 'Reporter is feuding with the author; ignore future ones.',
      actorUserId: 9,
      scope: SCOPE,
    })

    /*
     * Not "we remembered not to pass it" — the port has no field that could
     * carry it, so there is no version of this call that leaks one (D48).
     */
    expect(JSON.stringify(notifier.told)).not.toContain('feuding')
  })

  it('does not notify a moderator who closed their own report', async () => {
    const notifier = recordingNotifier()
    reports.report = { ...REPORT, reporterUserId: 9 }

    await service(notifier).close({
      reportId: 3,
      status: 'resolved',
      note: '',
      actorUserId: 9,
      scope: SCOPE,
    })

    /* A notification is for something you would not otherwise know. */
    expect(notifier.told).toEqual([])
  })

  it('says nothing when the reporter’s account has gone', async () => {
    const notifier = recordingNotifier()
    reports.report = { ...REPORT, reporterUserId: null }

    await service(notifier).close({
      reportId: 3,
      status: 'resolved',
      note: '',
      actorUserId: 9,
      scope: SCOPE,
    })

    expect(notifier.told).toEqual([])
  })

  it('does not notify when the report was already closed', async () => {
    const notifier = recordingNotifier()
    reports.closed = false

    await expect(
      service(notifier).close({
        reportId: 3,
        status: 'resolved',
        note: '',
        actorUserId: 9,
        scope: SCOPE,
      }),
    ).rejects.toThrow('already been closed')

    expect(notifier.told).toEqual([])
  })

  it('closes the report anyway when the notification fails', async () => {
    await expect(
      new ReportService({
        reports,
        notifier: {
          reportClosed: async () => {
            throw new Error('notifications table is unavailable')
          },
        },
        now: () => NOW,
      }).close({
        reportId: 3,
        status: 'resolved',
        note: '',
        actorUserId: 9,
        scope: SCOPE,
      }),
    ).resolves.toBeUndefined()
  })

  it('works on a board with no notification store at all', async () => {
    await expect(
      service(null).close({
        reportId: 3,
        status: 'resolved',
        note: '',
        actorUserId: 9,
        scope: SCOPE,
      }),
    ).resolves.toBeUndefined()
  })
})
