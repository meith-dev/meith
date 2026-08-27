import 'server-only'

import type { BanFilterAdminRepository, BanFilterRecord } from '@meith/accounts'

import { getContainer } from './container'

export function boardBanFilters(): BanFilterAdminRepository {
  return getContainer().banFilters
}

export async function banFilterAuthors(
  filters: readonly BanFilterRecord[],
): Promise<ReadonlyMap<number, string>> {
  const { accountStore } = getContainer()
  const names = new Map<number, string>()

  for (const id of new Set(filters.map((row) => row.createdByUserId))) {
    if (id === null || names.has(id)) continue

    const account = await accountStore.accounts.findById(id)
    if (account !== null) names.set(id, account.username)
  }

  return names
}
