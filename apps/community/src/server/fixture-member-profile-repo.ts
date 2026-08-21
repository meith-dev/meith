import 'server-only'

import type {
  MemberProfileRecord,
  MemberProfileRepository,
  MemberSuggestion,
} from '@meith/accounts'

import { SEED_MEMBER_PROFILES } from './seed-board'

export class FixtureMemberProfileRepository implements MemberProfileRepository {
  constructor(private readonly rows: readonly MemberProfileRecord[] = SEED_MEMBER_PROFILES) {}

  async findPublicById(id: number): Promise<MemberProfileRecord | null> {
    return this.rows.find((row) => row.id === id) ?? null
  }

  async searchByUsernamePrefix(
    prefix: string,
    limit: number,
  ): Promise<readonly MemberSuggestion[]> {
    if (prefix === '') return []
    const lower = prefix.toLowerCase()
    return this.rows
      .filter((row) => row.username.toLowerCase().startsWith(lower))
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, limit)
      .map((row) => ({ id: row.id, username: row.username }))
  }
}
