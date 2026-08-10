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
