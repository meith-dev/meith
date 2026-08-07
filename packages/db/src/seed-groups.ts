/**
 * The seeded group ladder's *keys*, as named constants.
 *
 * `usergroups.key` exists so that seeds, migrations and code can address a
 * group without depending on its id or its title (F15). That only works if
 * everybody spells the key the same way — and a string literal typed out at a
 * call site is a spelling nobody checks.
 *
 * They were not checked, and it cost an installer: the admin step looked up
 * `'administrator'` where migration `0001_seed_usergroups` seeds
 * `'administrators'`, so `findGroup` returned null and every fresh board failed
 * at "Create the administrator" with *"The usergroup ladder is missing.
 * Migrations did not seed it."* — a message about migrations, on a board whose
 * migrations had just run perfectly. A typo in a string is invisible to the
 * compiler; a typo in a property name is not.
 *
 * The ids live in `@meith/runtime`'s `SEED_GROUP`, which is where the promotion
 * guards read them. Keys live here, beside the SQL that writes them, and
 * `seed-usergroups.test.ts` asserts the migration and this constant agree — so
 * neither can drift without a red test.
 */
export const SEED_GROUP_KEY = {
  guests: 'guests',
  registered: 'registered',
  administrators: 'administrators',
  superModerators: 'super_moderators',
  moderators: 'moderators',
  awaitingActivation: 'awaiting_activation',
  banned: 'banned',
} as const

export type SeedGroupKey = (typeof SEED_GROUP_KEY)[keyof typeof SEED_GROUP_KEY]
