import type { DemoForum, DemoPrefix } from './types'

/**
 * Fourteen forums in three categories, and none of them named after one kind of
 * club.
 *
 * A board that splits *Sports*, *Gaming* and *Community* into three wings looks
 * like a brochure: every visitor sees two-thirds of a board that is not for
 * them. Real ones are organised by what a member is doing — turning up to a
 * thing, selling a thing, asking for help — and the same forums carry a fixture,
 * a raid night and a table quiz without noticing the difference.
 *
 * Two of them are closed: one to everybody outside the staff groups, one to
 * everybody not paying for the Supporters plan. Neither is visible to a member
 * who cannot read it — the tree is built from what the reader can see, so a
 * closed forum is absent rather than padlocked.
 */
export const DEMO_FORUMS: readonly DemoForum[] = [
  { key: 'cat-start', type: 'category', title: 'Start here', slug: 'start-here', parent: null },
  {
    key: 'announcements',
    type: 'forum',
    title: 'Announcements',
    slug: 'announcements',
    description: 'Notices, closures, changes of plan, and anything the committee needs everyone to have read.',
    parent: 'cat-start',
  },
  {
    key: 'introductions',
    type: 'forum',
    title: 'Introductions',
    slug: 'introductions',
    description: 'New here? Say who you are and what you turned up for.',
    parent: 'cat-start',
  },

  {
    key: 'cat-community',
    type: 'category',
    title: 'The community',
    slug: 'the-community',
    parent: null,
  },
  {
    key: 'general',
    type: 'forum',
    title: 'General discussion',
    slug: 'general-discussion',
    description: 'The main forum. Anything to do with the club, the crew, or the week just gone.',
    parent: 'cat-community',
  },
  {
    key: 'events',
    type: 'forum',
    title: 'Events and fixtures',
    slug: 'events-and-fixtures',
    description: 'Matches, raid nights, tournaments, socials. Sign-ups before, results after.',
    parent: 'cat-community',
  },
  {
    key: 'media',
    type: 'forum',
    title: 'Photos and clips',
    slug: 'photos-and-clips',
    description: 'Match photos, screenshots, highlight reels, and the team photo nobody likes.',
    parent: 'cat-community',
  },
  {
    key: 'noticeboard',
    type: 'forum',
    title: 'Noticeboard',
    slug: 'noticeboard',
    description: 'Lifts, lost property, volunteers wanted, and the small stuff that still needs saying.',
    parent: 'cat-community',
  },
  {
    key: 'market',
    type: 'forum',
    title: 'Buy, sell and swap',
    slug: 'buy-sell-and-swap',
    description: 'Kit, gear, tickets, hardware. Mark it sold and everyone thanks you.',
    parent: 'cat-community',
  },
  {
    key: 'offtopic',
    type: 'forum',
    title: 'Anything else',
    slug: 'anything-else',
    description: 'The other forum.',
    parent: 'cat-community',
  },
  {
    key: 'supporters',
    type: 'forum',
    title: "Supporters' room",
    slug: 'supporters-room',
    description: 'For members on the Supporters plan. Early word, the papers before the meeting, and where the money went.',
    parent: 'cat-community',
    access: 'supporters',
  },

  {
    key: 'cat-running',
    type: 'category',
    title: 'Running the place',
    slug: 'running-the-place',
    parent: null,
  },
  {
    key: 'membership',
    type: 'forum',
    title: 'Membership and subs',
    slug: 'membership-and-subs',
    description: 'Joining, renewing, fees, fundraising, and where the money went.',
    parent: 'cat-running',
  },
  {
    key: 'support',
    type: 'forum',
    title: 'Help with the board',
    slug: 'help-with-the-board',
    description: 'Cannot log in, cannot upload, notifications gone quiet. Say what you are on.',
    parent: 'cat-running',
  },
  {
    key: 'feedback',
    type: 'forum',
    title: 'Feedback and ideas',
    slug: 'feedback-and-ideas',
    description: 'Suggestions for the board and for how we do things. Somebody does read them.',
    parent: 'cat-running',
  },
  {
    key: 'moderation',
    type: 'forum',
    title: 'Moderation and rules',
    slug: 'moderation-and-rules',
    description: 'How this place is run, in the open.',
    parent: 'cat-running',
  },
  {
    key: 'committee',
    type: 'forum',
    title: 'Committee room',
    slug: 'committee-room',
    description: 'Staff only. Agendas, the awkward ones, and anything that needs deciding before it needs a thread.',
    parent: 'cat-running',
    access: 'staff',
  },
]

/**
 * Prefixes, scoped to the branch they belong to rather than offered everywhere.
 *
 * Eight labels on one board is a menu nobody reads; three in the forum you are
 * posting in is a habit. The scope is a category or a forum, and everything
 * beneath it inherits — which is the part worth seeing on a demo, because it is
 * the setting that keeps a prefix list usable as a board grows.
 */
export const DEMO_PREFIXES: readonly DemoPrefix[] = [
  { key: 'notice', label: 'Notice', token: 'thread-pinned', scope: 'announcements' },
  { key: 'fixture', label: 'Fixture', token: null, scope: 'events' },
  { key: 'signup', label: 'Sign-up', token: 'moderation-pending', scope: 'events' },
  { key: 'result', label: 'Result', token: 'moderation-approved', scope: 'events' },
  { key: 'forsale', label: 'For sale', token: null, scope: 'market' },
  { key: 'wanted', label: 'Wanted', token: 'thread-moved', scope: 'market' },
  { key: 'sold', label: 'Sold', token: 'thread-locked', scope: 'market' },
  { key: 'solved', label: 'Solved', token: 'moderation-approved', scope: 'support' },
]
