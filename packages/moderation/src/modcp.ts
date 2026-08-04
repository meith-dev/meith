/**
 * F54 — the moderator control panel's reads.
 *
 * Phase 4 built the *acts*: approve, report, lock, move, split, warn. What none
 * of them built is the place a moderator goes when nobody has handed them a
 * link — a screen that answers "what am I responsible for, and what has been
 * done here lately". That is all this file is: three read models, each scoped by
 * the same rule.
 *
 * **The rule: a moderator's ModCP shows their own forums, and nothing else.**
 * The panel is not an administrator's view with fewer buttons. A moderator of
 * one forum opening the log must see that forum's log — not a board-wide feed
 * with the other entries filtered out of the rendering, which is how a count or
 * a paging boundary leaks what it hid.
 *
 * The one section that is not forum-scoped is the IP lookup, and it is the one
 * that needed the most care. See `IpLookup`.
 */
import { ValidationError } from '@meith/core'

export const MODCP_PAGE_SIZE = 25

/** One entry of the moderator log. */
export interface ModLogEntry {
  readonly id: number
  readonly action: string
  readonly actorUserId: number | null
  readonly actorUsername: string | null
  readonly forumId: number | null
  readonly forumTitle: string | null
  /** Already-flattened detail: label/value pairs, never raw JSON. */
  readonly detail: readonly { readonly label: string; readonly value: string }[]
  readonly at: Date
}

export interface ModLogPage {
  readonly entries: readonly ModLogEntry[]
  readonly nextCursor?: string
}

/** One forum this actor moderates, with what they may do in it. */
export interface ModeratedForum {
  readonly forumId: number
  readonly title: string
  readonly slug: string
  /** Held threads and held replies waiting here. */
  readonly pending: number
  /** Open reports against content here. */
  readonly openReports: number
  /** The rights, already resolved by the caller — booleans, per R4. */
  readonly rights: readonly string[]
}

/**
 * An account that shares an address prefix with the one being looked up.
 *
 * A *prefix*, because that is all the board stores. F09 truncates every address
 * before it is written, so there is no query that could find an exact match —
 * and saying "shares an address" when the evidence is a /24 would be a
 * moderator acting on a certainty the data does not support.
 */
export interface IpMatch {
  readonly userId: number
  readonly username: string
  readonly matchedOn: 'registration' | 'last_visit' | 'both'
  readonly lastActiveAt: Date | null
}

export interface ModCpRepository {
  /**
   * The log, restricted to `forumIds` plus the actor's own entries.
   *
   * Their own, because a moderator has to be able to check what they did — and
   * because an entry they wrote in a forum they have since stopped moderating
   * is still theirs.
   */
  log(input: {
    readonly forumIds: readonly number[]
    readonly actorUserId: number
    readonly limit: number
    readonly after?: string | undefined
  }): Promise<ModLogPage>

  /** Counts for the dashboard, one query rather than one per forum. */
  workload(forumIds: readonly number[]): Promise<
    ReadonlyMap<number, { pending: number; openReports: number }>
  >

  /** Accounts sharing a stored address prefix with this member. */
  ipMatches(userId: number, limit: number): Promise<readonly IpMatch[]>

  /** The prefixes on record for a member, for the screen to show what it searched. */
  ipPrefixesFor(userId: number): Promise<{ registration: string | null; lastVisit: string | null }>

  /** Every IP lookup is written down. See `ModeratorPanel.lookUpIp`. */
  recordIpLookup(input: {
    readonly actorUserId: number
    readonly subjectUserId: number
    readonly matches: number
    readonly at: Date
  }): Promise<void>
}

export interface ModeratorPanelRights {
  /** `modcp.access` — the panel itself. */
  readonly access: boolean
  /**
   * Whether this actor may look up addresses.
   *
   * Deliberately a *separate* answer from `access`. Seeing the queue and being
   * able to ask "who else posts from this address" are different powers: the
   * second one is the panel's only feature that reads personal data about
   * somebody who has done nothing wrong, and MyBB gates it separately too.
   */
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

  /**
   * The dashboard: every forum this actor moderates, with its workload.
   *
   * `forums` and `rights` arrive already resolved because both are permission
   * answers, and permission answers are made in `@meith/authorization` (R4).
   * What this adds is the counts and the ordering — busiest first, because a
   * moderator with fourteen forums opens the panel to find the one that needs
   * them.
   */
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

  /**
   * Who else posts from this member's address prefix.
   *
   * Three things make this different from every other read in the panel.
   *
   *  1. **It is not forum-scoped**, because an address is not. That is exactly
   *     why it has its own permission rather than riding on `modcp.access`.
   *  2. **It is audited, and the audit row is written whether or not anything
   *     was found.** A lookup that returned nothing is still a moderator having
   *     asked, and a log that only records the productive ones cannot answer
   *     "who has been going through the membership".
   *  3. **It searches prefixes, and says so.** F09 truncates every address
   *     before storing it, so "shares an address" is not something this can
   *     establish — only "shares a /24". Reporting the former would be a
   *     moderator acting on a certainty the data does not support.
   *
   * The audit row is written *before* the caller sees the result, so there is no
   * arrangement of failures that returns matches without recording the request.
   */
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

/**
 * The moderator-facing name for a logged action.
 *
 * A map rather than a formatter per action, and unknown ids fall through to the
 * raw string. The log is written by ten different features and will be written
 * by more; a screen that renders only the actions it has heard of would hide
 * the newest ones, which are the ones somebody reading a log is looking for.
 */
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

/**
 * Which logged actions the moderator log shows.
 *
 * An allow-list, not a deny-list. `admin_log` is shared with the ACP (F63) and
 * will collect settings changes, group edits and user merges; a moderator's log
 * must not become a window onto administration because somebody added a row
 * type and nobody updated a filter. A new moderation action is invisible here
 * until it is named — which is a build-time omission somebody notices, rather
 * than a disclosure nobody does.
 */
export const MOD_LOG_ACTIONS: readonly string[] = Object.keys(MOD_LOG_LABELS)
