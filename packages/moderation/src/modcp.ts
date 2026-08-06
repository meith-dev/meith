import { ValidationError } from '@meith/core'

export const MODCP_PAGE_SIZE = 25

export interface ModLogEntry {
  readonly id: number
  readonly action: string
  readonly actorUserId: number | null
  readonly actorUsername: string | null
  readonly forumId: number | null
  readonly forumTitle: string | null
  readonly detail: readonly { readonly label: string; readonly value: string }[]
  readonly at: Date
}

export interface ModLogPage {
  readonly entries: readonly ModLogEntry[]
  readonly nextCursor?: string
}

export interface ModeratedForum {
  readonly forumId: number
  readonly title: string
  readonly slug: string
  readonly pending: number
  readonly openReports: number
  readonly rights: readonly string[]
}

export interface IpMatch {
  readonly userId: number
  readonly username: string
  readonly matchedOn: 'registration' | 'last_visit' | 'both'
  readonly lastActiveAt: Date | null
}

export interface ModCpRepository {
  log(input: {
    readonly forumIds: readonly number[]
    readonly actorUserId: number
    readonly limit: number
    readonly after?: string | undefined
  }): Promise<ModLogPage>

  workload(forumIds: readonly number[]): Promise<
    ReadonlyMap<number, { pending: number; openReports: number }>
  >

  ipMatches(userId: number, limit: number): Promise<readonly IpMatch[]>

  ipPrefixesFor(userId: number): Promise<{ registration: string | null; lastVisit: string | null }>

  recordIpLookup(input: {
    readonly actorUserId: number
    readonly subjectUserId: number
    readonly matches: number
    readonly at: Date
  }): Promise<void>
}

export interface ModeratorPanelRights {
  readonly access: boolean
  readonly ipLookup: boolean
}

export class ModeratorPanel {
  private readonly repo: ModCpRepository
  private readonly now: () => Date

  constructor(deps: { modcp: ModCpRepository; now?: () => Date }) {
    this.repo = deps.modcp
    this.now = deps.now ?? (() => new Date())
  }

  async log(input: {
    readonly forumIds: readonly number[]
    readonly actorUserId: number
    readonly after?: string | undefined
  }): Promise<ModLogPage> {
    return this.repo.log({
      forumIds: input.forumIds,
      actorUserId: input.actorUserId,
      limit: MODCP_PAGE_SIZE,
      ...(input.after === undefined ? {} : { after: input.after }),
    })
  }

  async dashboard(input: {
    readonly forums: readonly { forumId: number; title: string; slug: string; rights: readonly string[] }[]
  }): Promise<readonly ModeratedForum[]> {
    if (input.forums.length === 0) return []

    const workload = await this.repo.workload(input.forums.map((f) => f.forumId))
    return input.forums
      .map((forum) => ({
        ...forum,
        pending: workload.get(forum.forumId)?.pending ?? 0,
        openReports: workload.get(forum.forumId)?.openReports ?? 0,
      }))
      .sort(
        (a, b) =>
          b.pending + b.openReports - (a.pending + a.openReports) ||
          a.title.localeCompare(b.title),
      )
  }

  async lookUpIp(input: {
    readonly subjectUserId: number
    readonly actorUserId: number
    readonly rights: ModeratorPanelRights
    readonly limit?: number
  }): Promise<{
    readonly prefixes: { registration: string | null; lastVisit: string | null }
    readonly matches: readonly IpMatch[]
  }> {
    if (!input.rights.access || !input.rights.ipLookup) {
      throw new ValidationError('You cannot look up addresses.')
    }

    const prefixes = await this.repo.ipPrefixesFor(input.subjectUserId)
    const matches = await this.repo.ipMatches(
      input.subjectUserId,
      input.limit ?? MODCP_PAGE_SIZE,
    )

    await this.repo.recordIpLookup({
      actorUserId: input.actorUserId,
      subjectUserId: input.subjectUserId,
      matches: matches.length,
      at: this.now(),
    })

    return { prefixes, matches }
  }
}

export const MOD_LOG_LABELS: Readonly<Record<string, string>> = {
  'moderation.approve': 'Approved held content',
  'moderation.reject': 'Rejected held content',
  'thread.lock': 'Locked a thread',
  'thread.stick': 'Pinned a thread',
  'thread.move': 'Moved a thread',
  'thread.delete': 'Deleted a thread',
  'thread.restore': 'Restored a thread',
  'thread.split': 'Split a thread',
  'thread.merge': 'Merged two threads',
  'inline.approve': 'Approved a selection',
  'inline.delete': 'Deleted a selection',
  'inline.restore': 'Restored a selection',
  'inline.lock': 'Locked a selection',
  'inline.unlock': 'Unlocked a selection',
  'inline.stick': 'Pinned a selection',
  'inline.unstick': 'Unpinned a selection',
  'inline.move': 'Moved a selection',
  'report.resolve': 'Resolved a report',
  'report.reject': 'Rejected a report',
  'warning.issue': 'Issued a warning',
  'warning.revoke': 'Revoked a warning',
  'modcp.ip_lookup': 'Looked up an address',
}

export const MOD_LOG_ACTIONS: readonly string[] = Object.keys(MOD_LOG_LABELS)
