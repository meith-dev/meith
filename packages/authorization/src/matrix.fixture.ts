/**
 * F22 expected-results fixture. THE HUMAN-REVIEWED TABLE.
 *
 * This file is the specification, not the implementation. When a cell here and
 * the Authorizer disagree, the presumption is that the *code* is wrong until a
 * reviewer deliberately changes a value here with a reason in the PR. That is
 * what makes F22 a regression net rather than a change-detector: a behaviour
 * change cannot land without editing this table on purpose.
 *
 * Format: for each actor, for each forum context, the SET of the twelve actions
 * that are ALLOWED. Anything not listed is expected to be denied. Listing only
 * the positives keeps 8x4 cells readable; the test still checks all 12 actions
 * in every cell (absent = must be false), so an accidental grant fails too.
 *
 * Contexts:
 *   public    — ordinary forum, group defaults, no overrides
 *   publicSub — read-only child of `public`: posting overridden off, everything
 *               else inherited. Exercises inheritance + same-level override.
 *   private   — canView overridden false for guest/registered/veterans. Staff
 *               reach it only via bypass, never an override.
 *   password  — password-protected; the acting session has NOT entered the
 *               password (passwordSatisfied=false).
 */

export const F22_ACTIONS = [
  'view', // read the forum's threads         -> thread.view
  'postThread', // start a thread             -> thread.post
  'postReply', // reply to a thread           -> reply.post
  'editOwn', // edit your own post            -> post.editOwn
  'editOthers', // edit someone else's post   -> post.editOthers
  'deleteOwn', // delete your own post        -> post.deleteOwn
  'softDelete', // soft-delete a post         -> post.softDelete
  'viewUnapproved', // see unapproved content -> content.viewUnapproved
  'viewDeleted', // see deleted content       -> content.viewDeleted
  'upload', // attach a file                  -> attachment.upload
  'search', // search within the forum        -> forum.search
  'subscribe', // subscribe to the forum      -> forum.subscribe
] as const

export type F22Action = (typeof F22_ACTIONS)[number]

/** All twelve, for the "everything" cells (staff bypass). */
const ALL: readonly F22Action[] = F22_ACTIONS

/** The registered-member baseline in an ordinary forum. */
const MEMBER_PUBLIC: readonly F22Action[] = [
  'view',
  'postThread',
  'postReply',
  'editOwn',
  'deleteOwn',
  'upload',
  'search',
  'subscribe',
]

/** Same member in the read-only subforum: posting drops out, the rest inherit. */
const MEMBER_READONLY: readonly F22Action[] = [
  'view',
  'editOwn',
  'deleteOwn',
  'upload',
  'search',
  'subscribe',
]

/** A forum moderator in a forum they moderate: member baseline plus mod powers. */
const MOD_PUBLIC: readonly F22Action[] = ALL

/** A forum moderator in the read-only subforum: mod powers, but still no posting. */
const MOD_READONLY: readonly F22Action[] = [
  'view',
  'editOwn',
  'editOthers',
  'deleteOwn',
  'softDelete',
  'viewUnapproved',
  'viewDeleted',
  'upload',
  'search',
  'subscribe',
]

export type ExpectedMatrix = Record<
  string, // actor name
  Record<string, readonly F22Action[]> // forum name -> allowed actions
>

export const EXPECTED: ExpectedMatrix = {
  guest: {
    public: ['view', 'search'],
    publicSub: ['view', 'search'],
    private: [], // canView overridden false
    password: [], // locked: password not entered
  },

  registered: {
    public: MEMBER_PUBLIC,
    publicSub: MEMBER_READONLY,
    private: [],
    password: [],
  },

  // registered + veterans. Veterans is purely additive (polls, unlimited post
  // cap), so for these twelve actions the result must equal `registered`.
  // That equality is the F20 "user in multiple groups" acceptance in table form.
  secondary: {
    public: MEMBER_PUBLIC,
    publicSub: MEMBER_READONLY,
    private: [],
    password: [],
  },

  // Moderator of `public` (cascades to `publicSub`); an ordinary member in the
  // forums they do not moderate.
  forumModerator: {
    public: MOD_PUBLIC,
    publicSub: MOD_READONLY,
    private: [], // not a mod here, and canView is off
    password: [], // not a mod here, password not entered
  },

  // Super moderator: bypasses forum permissions everywhere (private and
  // password included) but not admin-only actions — none of which are in the
  // twelve, so every cell is the full set.
  superModerator: {
    public: ALL,
    publicSub: ALL,
    private: ALL,
    password: ALL,
  },

  // Administrator: same as super-mod for these twelve.
  administrator: {
    public: ALL,
    publicSub: ALL,
    private: ALL,
    password: ALL,
  },

  // Banned: the account-state gate denies everything before permissions are
  // even consulted, regardless of group.
  banned: {
    public: [],
    publicSub: [],
    private: [],
    password: [],
  },

  // Awaiting activation: read-only. Of the twelve, only `view` and `search`
  // are reads, and only where the forum matrix also allows them.
  awaiting: {
    public: ['view', 'search'],
    publicSub: ['view', 'search'],
    private: [], // canView off
    password: [], // locked
  },
}
