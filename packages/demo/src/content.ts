import { COMMUNITY_THREADS } from './content/community'
import { NOTICEBOARD_THREADS } from './content/noticeboard'
import { RUNNING_THREADS } from './content/running'
import { STAFF_THREADS } from './content/staff'
import { START_THREADS } from './content/start'
import { SUPPORTERS_THREADS } from './content/supporters'
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
  ...STAFF_THREADS,
  ...SUPPORTERS_THREADS,
  ...START_THREADS,
  ...COMMUNITY_THREADS,
  ...NOTICEBOARD_THREADS,
  ...RUNNING_THREADS,
]
