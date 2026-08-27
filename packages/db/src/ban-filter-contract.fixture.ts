import { describe, expect, it } from 'vitest'

import type { BanFilterAdminRepository } from '@meith/accounts'
import { BAN_FILTER_PATTERN_MAX, BAN_FILTER_WILDCARD_MAX } from '@meith/accounts'
import { ValidationError } from '@meith/core'

export const CONTRACT_AUTHOR = 4242

export type BanFilterRepositoryFactory = () => Promise<BanFilterAdminRepository>

export function banFilterRepositoryContract(name: string, make: BanFilterRepositoryFactory): void {
  describe(`BanFilterAdminRepository contract: ${name}`, () => {
    it('round-trips the pattern, the note and who added it', async () => {
      const filters = await make()
      const id = await filters.create({
        type: 'email',
        pattern: '*@blocked.example',
        note: 'the sign-up wave in March',
        createdByUserId: CONTRACT_AUTHOR,
      })

      const stored = await filters.listForAdmin()

      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        id,
        type: 'email',
        pattern: '*@blocked.example',
        note: 'the sign-up wave in March',
        createdByUserId: CONTRACT_AUTHOR,
      })
      expect(stored[0]?.createdAt).toBeInstanceOf(Date)
    })

    it('lists the newest filter first', async () => {
      const filters = await make()
      await filters.create({ type: 'username', pattern: 'first*', createdByUserId: null })
      await filters.create({ type: 'username', pattern: 'second*', createdByUserId: null })

      expect((await filters.listForAdmin()).map((row) => row.pattern)).toEqual([
        'second*',
        'first*',
      ])
    })

    it('keeps an unwritten note and an unnamed author as null', async () => {
      const filters = await make()
      await filters.create({
        type: 'ip',
        pattern: '192.0.2.*',
        note: '   ',
        createdByUserId: null,
      })

      expect((await filters.listForAdmin())[0]).toMatchObject({
        note: null,
        createdByUserId: null,
      })
    })

    it('stores the pattern without the whitespace around it', async () => {
      const filters = await make()
      await filters.create({ type: 'username', pattern: '  spammer*  ', createdByUserId: null })

      expect((await filters.listForAdmin())[0]?.pattern).toBe('spammer*')
    })

    it('refuses a second filter of the same type and pattern', async () => {
      const filters = await make()
      await filters.create({ type: 'email', pattern: '*@blocked.example', createdByUserId: null })

      await expect(
        filters.create({ type: 'email', pattern: '*@blocked.example', createdByUserId: null }),
      ).rejects.toThrow(ValidationError)

      expect(await filters.listForAdmin()).toHaveLength(1)
    })

    it('holds the same pattern under a different type', async () => {
      const filters = await make()
      await filters.create({ type: 'email', pattern: 'shared*', createdByUserId: null })

      await expect(
        filters.create({ type: 'username', pattern: 'shared*', createdByUserId: null }),
      ).resolves.toEqual(expect.any(Number))
    })

    it('refuses an empty pattern before writing anything', async () => {
      const filters = await make()

      await expect(
        filters.create({ type: 'username', pattern: '   ', createdByUserId: null }),
      ).rejects.toThrow(ValidationError)

      expect(await filters.listForAdmin()).toHaveLength(0)
    })

    it('refuses a pattern longer than the cap before writing anything', async () => {
      const filters = await make()

      await expect(
        filters.create({
          type: 'username',
          pattern: 'a'.repeat(BAN_FILTER_PATTERN_MAX + 1),
          createdByUserId: null,
        }),
      ).rejects.toThrow(ValidationError)

      expect(await filters.listForAdmin()).toHaveLength(0)
    })

    it('refuses a pattern with more wildcards than the cap before writing anything', async () => {
      const filters = await make()

      await expect(
        filters.create({
          type: 'username',
          pattern: `a${'*a'.repeat(BAN_FILTER_WILDCARD_MAX + 1)}`,
          createdByUserId: null,
        }),
      ).rejects.toThrow(ValidationError)

      expect(await filters.listForAdmin()).toHaveLength(0)
    })

    it('removes a filter', async () => {
      const filters = await make()
      const id = await filters.create({
        type: 'email',
        pattern: '*@blocked.example',
        createdByUserId: null,
      })

      await filters.remove(id)

      expect(await filters.listForAdmin()).toHaveLength(0)
      expect(await filters.listAll()).toHaveLength(0)
    })

    it('treats removing a filter that is already gone as done', async () => {
      const filters = await make()
      const id = await filters.create({
        type: 'email',
        pattern: '*@blocked.example',
        createdByUserId: null,
      })

      await filters.remove(id)

      await expect(filters.remove(id)).resolves.toBeUndefined()
    })

    it('gives the matcher only what it needs to match on', async () => {
      const filters = await make()
      const id = await filters.create({
        type: 'email',
        pattern: '*@blocked.example',
        note: 'a note the matcher has no use for',
        createdByUserId: CONTRACT_AUTHOR,
      })

      expect(await filters.listAll()).toEqual([{ id, type: 'email', pattern: '*@blocked.example' }])
    })
  })
}
