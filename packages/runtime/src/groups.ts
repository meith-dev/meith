/**
 * The seeded group ladder's ids.
 *
 * Fixed by migration `0001_seed_usergroups`, which inserts them with explicit
 * ids and then advances the sequence — so these are facts about the schema
 * rather than configuration, and a constant is the honest shape.
 *
 * Duplicated from `apps/community/src/server/seed-board.ts` deliberately: that copy
 * is the *fixture board's* ladder and exists to make in-memory sample data
 * resolve, while this one is what the promotion guards read when they refuse to
 * demote staff or un-ban somebody. They agree because the migration makes them
 * agree, and `seed-usergroups.test.ts` pins the ids against the real SQL.
 */
export const SEED_GROUP = {
  guest: 1,
  registered: 2,
  administrators: 3,
  superModerators: 4,
  moderators: 5,
  awaitingActivation: 6,
  banned: 7,
} as const
