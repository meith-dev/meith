/**
 * The demo board's content, written out rather than generated.
 *
 * Generated text is why most demos read as demos: forty threads called "Test
 * thread 12" tell a visitor nothing about whether the software is any good at
 * holding a conversation. Everything here is a conversation somebody could
 * plausibly have had on the board of a club that plays on a Saturday, runs a
 * raid night on a Tuesday, and has a table quiz to pay for the drainage.
 *
 * It is one club rather than three demonstration wings, because that is what a
 * visitor is buying: the same ordinary forums carrying a fixture, a roster, a
 * lost gear bag and an AGM without any of them looking like a special case.
 *
 * Times are **offsets from the reset**, never absolute dates. A demo seeded with
 * real timestamps is fresh on the day it is written and visibly abandoned a
 * month later; these re-date themselves on every reset, so the newest post is
 * always minutes old and the board is always two years into its life.
 */

import { COMMUNITY_THREADS } from './content/community'
import { NOTICEBOARD_THREADS } from './content/noticeboard'
import { PRIVATE_THREADS } from './content/private'
import { RUNNING_THREADS } from './content/running'
import { START_THREADS } from './content/start'
import type { DemoThread } from './content/types'

export { DEMO_FORUMS, DEMO_PREFIXES } from './content/forums'
export { DEMO_MESSAGES, DEMO_REPORTS, DEMO_THANKS } from './content/social'
export type {
  DemoForum,
  DemoForumAccess,
  DemoMessage,
  DemoPoll,
  DemoPrefix,
  DemoReply,
  DemoReport,
  DemoThanks,
  DemoThread,
} from './content/types'

export const DEMO_THREADS: readonly DemoThread[] = [
  ...START_THREADS,
  ...COMMUNITY_THREADS,
  ...NOTICEBOARD_THREADS,
  ...RUNNING_THREADS,
  ...PRIVATE_THREADS,
]
