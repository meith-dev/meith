import 'server-only'

import type { MemberProfileRecord, MemberProfileRepository } from '@forum/accounts'

import { SEED_MEMBER_PROFILES } from './seed-board'

export class FixtureMemberProfileRepository implements MemberProfileRepository {
  constructor(private readonly rows: readonly MemberProfileRecord[] = SEED_MEMBER_PROFILES) {}

  async findPublicById(id: number): Promise<MemberProfileRecord | null> {
    return this.rows.find((row) => row.id === id) ?? null
  }
}
