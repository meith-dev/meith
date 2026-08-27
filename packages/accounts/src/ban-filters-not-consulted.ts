import type { BanFilterRepository } from './ports'

export const BAN_FILTERS_NOT_CONSULTED: BanFilterRepository = {
  listAll: async () => [],
}
