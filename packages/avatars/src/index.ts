import {
  type AcceptedUpload,
  acceptFile,
  type ImageProcessor,
  type IncomingFile,
  storageKeyFor,
} from '@meith/attachments'
import type { FileStore } from '@meith/core'
import { ForbiddenError, ValidationError } from '@meith/core'

import { AVATAR_BOX, AVATAR_MAX_BYTES } from './limits'

export { AVATAR_BOX, AVATAR_MAX_BYTES } from './limits'

export type AvatarStatus = 'none' | 'pending' | 'ready' | 'failed'

export interface StoredAvatar {
  readonly status: AvatarStatus
  readonly key: string | null
  readonly sourceKey: string | null
  readonly width: number | null
  readonly height: number | null
  readonly failureReason: string | null
  readonly updatedAt: Date | null
  readonly locked: boolean
  readonly lockedReason: string | null
}

export const NO_AVATAR: StoredAvatar = {
  status: 'none',
  key: null,
  sourceKey: null,
  width: null,
  height: null,
  failureReason: null,
  updatedAt: null,
  locked: false,
  lockedReason: null,
}

export function avatarVisible(avatar: StoredAvatar): boolean {
  return avatar.status === 'ready' && avatar.key !== null && !avatar.locked
}

export function avatarUrl(userId: number, avatar: StoredAvatar): string | null {
  if (!avatarVisible(avatar)) return null
  const version = avatar.updatedAt === null ? 0 : avatar.updatedAt.getTime()
  return `/avatar/${userId}?v=${version}`
}

export interface AvatarRepository {
  find(userId: number): Promise<StoredAvatar | null>
  readMany(userIds: readonly number[]): Promise<ReadonlyMap<number, StoredAvatar>>
  beginUpload(input: {
    readonly userId: number
    readonly sourceKey: string
    readonly at: Date
  }): Promise<{ readonly replaced: readonly string[] }>
  markReady(input: {
    readonly userId: number
    readonly key: string
    readonly width: number
    readonly height: number
  }): Promise<void>
  markFailed(userId: number, reason: string): Promise<void>
  clear(userId: number): Promise<{ readonly replaced: readonly string[] }>
  lock(input: {
    readonly userId: number
    readonly locked: boolean
    readonly reason: string | null
  }): Promise<void>
  stalled(before: Date, limit: number): Promise<readonly number[]>

  rememberKey(key: string): Promise<void>
  forgetKeys(keys: readonly string[]): Promise<void>
}

export interface AvatarServiceDeps {
  readonly avatars: AvatarRepository
  readonly files: FileStore
  readonly images: ImageProcessor
  readonly random?: () => string
  readonly now?: () => Date
}

export const AVATAR_PROCESSING_GRACE_MINUTES = 30

export class AvatarService {
  private readonly deps: AvatarServiceDeps
  private readonly random: () => string
  private readonly now: () => Date

  constructor(deps: AvatarServiceDeps) {
    this.deps = deps
    this.random = deps.random ?? (() => crypto.randomUUID())
    this.now = deps.now ?? (() => new Date())
  }

  async upload(input: {
    readonly userId: number
    readonly file: IncomingFile
    readonly mayUpload: boolean
  }): Promise<void> {
    if (!input.mayUpload) {
      throw new ForbiddenError('You may not upload an avatar.')
    }

    const current = await this.deps.avatars.find(input.userId)
    if (current?.locked === true) {
      throw new ForbiddenError('A moderator has locked your avatar, so it cannot be changed.')
    }

    const accepted = this.accept(input.file)

    const key = storageKeyFor('source', this.random)
    await this.deps.avatars.rememberKey(key)
    await this.deps.files.put(key, accepted.bytes, {
      contentType: accepted.type.contentType,
      visibility: 'private',
    })

    const { replaced } = await this.deps.avatars.beginUpload({
      userId: input.userId,
      sourceKey: key,
      at: this.now(),
    })
    await this.deps.avatars.forgetKeys([key])
    await this.sweepKeys(replaced)
  }

  private accept(file: IncomingFile): AcceptedUpload {
    const accepted = acceptFile(file, {
      maxPerPost: 1,
      maxSizeKb: AVATAR_MAX_BYTES / 1024,
    })

    if (accepted.type.codec === null) {
      throw new ValidationError('An avatar must be a PNG or a JPEG.')
    }
    return accepted
  }

  async process(userId: number): Promise<'done' | 'skipped' | 'failed'> {
    const current = await this.deps.avatars.find(userId)
    if (current === null || current.status !== 'pending' || current.sourceKey === null) {
      return 'skipped'
    }

    const source = await this.deps.files.get(current.sourceKey)
    if (source === undefined) {
      await this.fail(userId, 'The uploaded file is no longer available.', current.sourceKey)
      return 'failed'
    }

    const accepted = (() => {
      try {
        return this.accept({ filename: 'avatar', bytes: source })
      } catch {
        return null
      }
    })()

    if (accepted === null) {
      await this.fail(userId, 'That image could not be read.', current.sourceKey)
      return 'failed'
    }

    let processed: Awaited<ReturnType<ImageProcessor['process']>>
    try {
      processed = await this.deps.images.process({
        bytes: source,
        codec: accepted.type.codec as 'png' | 'jpeg',
        fit: AVATAR_BOX,
        thumbnail: false,
      })
    } catch {
      await this.fail(userId, 'That image could not be read.', current.sourceKey)
      return 'failed'
    }

    const key = storageKeyFor('file', this.random)
    await this.deps.avatars.rememberKey(key)
    await this.deps.files.put(key, processed.bytes, {
      contentType: processed.contentType,
      visibility: 'private',
    })

    await this.deps.avatars.markReady({
      userId,
      key,
      width: processed.width,
      height: processed.height,
    })
    await this.deps.avatars.forgetKeys([key])
    await this.discard(current.sourceKey)
    return 'done'
  }

  async remove(userId: number): Promise<void> {
    const current = await this.deps.avatars.find(userId)
    if (current?.locked === true) {
      throw new ForbiddenError('A moderator has locked your avatar, so it cannot be changed.')
    }
    const { replaced } = await this.deps.avatars.clear(userId)
    await this.sweepKeys(replaced)
  }

  async setLock(input: {
    readonly userId: number
    readonly locked: boolean
    readonly reason: string
  }): Promise<void> {
    const reason = input.reason.trim()
    if (input.locked && reason === '') {
      throw new ValidationError('Give a reason. The member is shown it.')
    }
    await this.deps.avatars.lock({
      userId: input.userId,
      locked: input.locked,
      reason: input.locked ? reason : null,
    })
  }

  async sweep(limit = 200): Promise<number> {
    const cutoff = new Date(this.now().getTime() - AVATAR_PROCESSING_GRACE_MINUTES * 60_000)
    const stalled = await this.deps.avatars.stalled(cutoff, limit)

    for (const userId of stalled) {
      const current = await this.deps.avatars.find(userId)
      await this.deps.avatars.markFailed(
        userId,
        'Processing did not finish. Please upload it again.',
      )
      if (current?.sourceKey != null) await this.discard(current.sourceKey)
    }
    return stalled.length
  }

  private async fail(userId: number, reason: string, sourceKey: string): Promise<void> {
    await this.deps.avatars.markFailed(userId, reason)
    await this.discard(sourceKey)
  }

  private async sweepKeys(keys: readonly string[]): Promise<void> {
    for (const key of keys) await this.discard(key)
  }

  private async discard(key: string): Promise<void> {
    await this.deps.files.delete(key)
    await this.deps.avatars.forgetKeys([key])
  }
}
