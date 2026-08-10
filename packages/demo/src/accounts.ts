/**
 * The people on the demo board.
 *
 * Three of them have a published password and are the ones a visitor logs in as.
 * The rest exist to write the content — they have no password anybody knows,
 * because a member account nobody can reach is still a member account, and a
 * board where every author is also a door is a board with forty doors.
 */

export type DemoGroupKey =
  | 'administrators'
  | 'superModerators'
  | 'moderators'
  | 'registered'
  | 'awaitingActivation'

export interface DemoAccount {
  /** Stable handle used by the content to refer to an author. */
  readonly key: string
  readonly username: string
  readonly email: string
  /** `null` means no published password: the account cannot be logged into. */
  readonly password: string | null
  readonly group: DemoGroupKey
  /** Days before the reset that this account registered. */
  readonly joinedDaysAgo: number
  readonly location: string | null
  readonly website: string | null
  readonly bio: string | null
}

/**
 * `admin` is five characters, and the board's own policy wants eight. That is
 * not a contradiction to paper over: the seed writes the hash directly rather
 * than going through registration, so the policy stays honest for every account
 * created after the seed — including the one a visitor makes themselves. What a
 * demo needs is a password somebody can retype from a banner without a paste
 * buffer, and `admin` is that password.
 */
export const DEMO_LOGINS = {
  admin: { username: 'admin', password: 'admin' },
  moderator: { username: 'moderator', password: 'moderator' },
  member: { username: 'member', password: 'member' },
} as const

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    key: 'admin',
    username: DEMO_LOGINS.admin.username,
    email: 'admin@demo.invalid',
    password: DEMO_LOGINS.admin.password,
    group: 'administrators',
    joinedDaysAgo: 612,
    location: 'Galway',
    website: 'https://meith.dev',
    bio: 'Keeps the lights on. Log in as me to see the admin panel — every screen in it is live.',
  },
  {
    key: 'moderator',
    username: DEMO_LOGINS.moderator.username,
    email: 'moderator@demo.invalid',
    password: DEMO_LOGINS.moderator.password,
    group: 'moderators',
    joinedDaysAgo: 540,
    location: 'Cork',
    website: null,
    bio: 'Reads the reports queue so you do not have to. There is something in it right now.',
  },
  {
    key: 'member',
    username: DEMO_LOGINS.member.username,
    email: 'member@demo.invalid',
    password: DEMO_LOGINS.member.password,
    group: 'registered',
    joinedDaysAgo: 96,
    location: null,
    website: null,
    bio: 'An ordinary account, with ordinary permissions. Useful for seeing what a member cannot do.',
  },

  {
    key: 'niamh',
    username: 'niamh_ok',
    email: 'niamh@demo.invalid',
    password: null,
    group: 'superModerators',
    joinedDaysAgo: 583,
    location: 'Dublin',
    website: null,
    bio: 'Here since the second week. Ask me about the migration.',
  },
  {
    key: 'tomas',
    username: 'tomasq',
    email: 'tomas@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 471,
    location: 'Lisbon',
    website: 'https://example.invalid/tomas',
    bio: 'Runs a board for a cycling club. Mostly lurks here.',
  },
  {
    key: 'ada',
    username: 'ada.builds',
    email: 'ada@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 402,
    location: 'Manchester',
    website: null,
    bio: 'Themes, mostly. Occasionally a plugin that does one thing.',
  },
  {
    key: 'ken',
    username: 'kenji',
    email: 'kenji@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 366,
    location: 'Osaka',
    website: null,
    bio: null,
  },
  {
    key: 'rosa',
    username: 'rosa_p',
    email: 'rosa@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 298,
    location: 'Bogotá',
    website: null,
    bio: 'Moved 40k posts off a hosted forum last spring. Ask me how it went.',
  },
  {
    key: 'dev',
    username: 'devinder',
    email: 'devinder@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 254,
    location: 'Leeds',
    website: null,
    bio: null,
  },
  {
    key: 'mira',
    username: 'mira',
    email: 'mira@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 187,
    location: 'Tallinn',
    website: null,
    bio: 'Self-hosting everything, one service at a time.',
  },
  {
    key: 'olu',
    username: 'oluwaseun',
    email: 'oluwaseun@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 143,
    location: 'Lagos',
    website: null,
    bio: null,
  },
  {
    key: 'petra',
    username: 'petra.k',
    email: 'petra@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 88,
    location: 'Brno',
    website: null,
    bio: null,
  },
  {
    key: 'sam',
    username: 'samthedog',
    email: 'sam@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 41,
    location: null,
    website: null,
    bio: null,
  },
  {
    key: 'newcomer',
    username: 'first_timer',
    email: 'first.timer@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 3,
    location: null,
    website: null,
    bio: null,
  },
  {
    // Writes the spam. One post held in the moderation queue, one that got
    // through and has been reported — so both staff screens have a real row in
    // them, from a real account, that a visitor can act on.
    key: 'spambot',
    username: 'watch_deals_2026',
    email: 'watch.deals@demo.invalid',
    password: null,
    group: 'registered',
    joinedDaysAgo: 0,
    location: null,
    website: null,
    bio: null,
  },
  {
    key: 'pending',
    username: 'not_activated_yet',
    email: 'pending@demo.invalid',
    password: null,
    // Sits in the awaiting-activation group so the admin panel's user filters
    // have something to find, and so "approve this account" is a real button
    // with a real row under it.
    group: 'awaitingActivation',
    joinedDaysAgo: 1,
    location: null,
    website: null,
    bio: null,
  },
]

/**
 * The accounts a visitor is invited to log in as. Their password and email are
 * frozen for the life of the demo — see `packages/demo/src/protected.ts`.
 */
export const DEMO_LOGIN_USERNAMES: readonly string[] = Object.values(DEMO_LOGINS).map(
  (login) => login.username,
)

export function demoAccount(key: string): DemoAccount {
  const found = DEMO_ACCOUNTS.find((account) => account.key === key)
  if (found === undefined) {
    throw new Error(`The demo content refers to an author "${key}" that no account defines.`)
  }
  return found
}
