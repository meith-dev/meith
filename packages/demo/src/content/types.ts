/**
 * The shapes the demo's written content comes in.
 *
 * Times are **offsets from the reset**, never absolute dates. A demo seeded with
 * real timestamps is fresh on the day it is written and visibly abandoned a
 * month later; these re-date themselves on every reset, so the newest post is
 * always minutes old and the board is always two years into its life.
 */

/**
 * Who can see a forum at all.
 *
 * `staff` is closed to everybody outside the three staff groups; `supporters`
 * is closed to everybody who is not paying for the Supporters plan, which is a
 * group the Dues plugin grants and takes away on its own. Both are written as
 * per-forum permission overrides, the same rows an administrator writes from
 * the permissions screen — there is no separate notion of a private forum.
 */
export type DemoForumAccess = 'staff' | 'supporters'

export interface DemoForum {
  readonly key: string
  readonly type: 'category' | 'forum'
  readonly title: string
  readonly slug: string
  readonly description?: string
  readonly parent: string | null
  /** Omitted means what almost every forum is: readable by everyone. */
  readonly access?: DemoForumAccess
}

/**
 * A thread prefix. `scope` names a forum — usually a category — and the prefix
 * is offered in that forum and everything beneath it, which is how a board ends
 * up with "Match report" on the pitch side and "LFG" on the guild side rather
 * than one list of fifteen labels everywhere.
 */
export interface DemoPrefix {
  readonly key: string
  readonly label: string
  /** Names a theme token for the badge's colour, or `null` for the plain one. */
  readonly token: string | null
  readonly scope: string | null
}

export interface DemoReply {
  readonly author: string
  readonly message: string
  /** Hours after the thread's opening post. */
  readonly hoursAfter: number
  readonly visibility?: 'visible' | 'unapproved'
  /** Quotes an earlier post: 0 is the opening post, 1 the first reply. */
  readonly quotes?: number
}

export interface DemoPoll {
  readonly question: string
  /**
   * One entry per option: its label, and the accounts that voted for it. Voters
   * are named rather than counted because a vote is a row keyed by user, and a
   * count of nine with six accounts to cast it is a poll that cannot exist.
   */
  readonly options: readonly { readonly label: string; readonly voters: readonly string[] }[]
  readonly closesInDays: number | null
  /** How many options one member may pick: 1 for a single choice, 0 for no limit. */
  readonly maxOptions?: number
  readonly allowRevote?: boolean
  readonly publicVotes?: boolean
}

export interface DemoThread {
  readonly forum: string
  readonly author: string
  readonly title: string
  readonly message: string
  /** Days before the reset that the thread was opened. */
  readonly daysAgo: number
  readonly prefix?: string
  readonly visibility?: 'visible' | 'unapproved'
  readonly sticky?: boolean
  readonly locked?: boolean
  readonly poll?: DemoPoll
  readonly replies?: readonly DemoReply[]
}

/** Reputation given on posts, so profiles and post footers are not all zeroes. */
export interface DemoThanks {
  readonly threadTitle: string
  /** 0 is the opening post, 1 the first reply, and so on. */
  readonly postIndex: number
  readonly from: readonly string[]
}

/** Private messages, so an inbox is not empty on first login. */
export interface DemoMessage {
  readonly from: string
  readonly to: readonly string[]
  readonly subject: string
  readonly message: string
  readonly daysAgo: number
}

/** Open reports, so the moderation queue has something in it. */
export interface DemoReport {
  readonly reporter: string
  readonly threadTitle: string
  readonly postIndex: number
  readonly reason: string
  readonly hoursAgo: number
}
