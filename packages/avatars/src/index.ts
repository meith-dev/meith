/**
 * `@forum/avatars` — F58's other half.
 *
 * An avatar is an upload, so the machinery is F42's: sniff the bytes, refuse
 * anything the board cannot attest to, store the original where nothing can
 * reach it, re-encode from decoded pixels in a queued job, and serve only what
 * the encoder wrote. D65 is why, and none of it is restated here.
 *
 * What is different, and why this is its own package rather than a corner of
 * `@forum/attachments`:
 *
 * **There is one per member, and a new one replaces the old.** So the write is
 * an overwrite, and the object it replaces has to be handed to the sweep rather
 * than dropped — an attachment is never replaced, only deleted with its post.
 *
 * **It is square, small, and always JPEG or PNG at a fixed box.** An attachment
 * keeps its shape; an avatar is fitted to `AVATAR_BOX` because it renders at a
 * fixed size in every postbit on the board, and shipping a 2000px image to be
 * displayed at 48px is a cost paid by every reader of every thread.
 *
 * **A moderator locks it rather than deleting it**, exactly as with signatures
 * (D61): deleting leaves nothing to stop the same image being uploaded again
 * the next minute and nothing that says it was a decision. Locked stops it
 * rendering, stops the member replacing it, keeps the object so an appeal can
 * see what was there, and records why.
 *
 * **A remote URL is still not an option.** Rendered directly it is a tracking
 * beacon reporting every reader's IP to a third party — which F58's own
 * acceptance forbids — and fetched server-side it is SSRF. The only safe
 * remote-URL feature ends at fetch-validate-re-encode-store, which is this,
 * with an SSRF problem bolted on the front. So it is absent rather than
 * half-built (D32).
 */
import { ForbiddenError, ValidationError } from '@forum/core'
import type { FileStore } from '@forum/core'
import {
  acceptFile,
  storageKeyFor,
  type AcceptedUpload,
  type ImageProcessor,
  type IncomingFile,
} from '@forum/attachments'

import { AVATAR_BOX, AVATAR_MAX_BYTES } from './limits'

export { AVATAR_BOX, AVATAR_MAX_BYTES } from './limits'

/** `none` is a real state and the commonest one, not an absence. */
export type AvatarStatus = 'none' | 'pending' | 'ready' | 'failed'

/** An avatar as stored, from the member's own row. */
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

/**
 * Whether this avatar should be shown.
 *
 * The single predicate every render path uses, so "locked" and "still being
 * processed" cannot be handled in one place and forgotten in another. A locked
 * avatar reads exactly like no avatar to everybody except its owner, who is
 * told why on their own screen.
 */
export function avatarVisible(avatar: StoredAvatar): boolean {
  return avatar.status === 'ready' && avatar.key !== null && !avatar.locked
}

/**
 * The URL a theme renders, or null.
 *
 * The member id and the update time, and no object key: a key in a URL is a
 * capability, and one that outlives a moderator's lock. `v` is what makes a
 * replacement a different URL, so no cache anywhere keeps showing the old face.
 */
export function avatarUrl(userId: number, avatar: StoredAvatar): string | null {
  if (!avatarVisible(avatar)) return null
  const version = avatar.updatedAt === null ? 0 : avatar.updatedAt.getTime()
  return `/avatar/${userId}?v=${version}`
}

export interface AvatarRepository {
  /** One member's avatar columns. */
  find(userId: number): Promise<StoredAvatar | null>
  /** A whole page of postbits, in one query. */
  readMany(userIds: readonly number[]): Promise<ReadonlyMap<number, StoredAvatar>>
  /**
   * Begin an upload. Returns the key it replaced, if any, so the caller can
   * hand it to the sweep — the row stops pointing at it here, and nothing else
   * ever will.
   */
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
  /** Removes the member's own avatar. Returns what to sweep. */
  clear(userId: number): Promise<{ readonly replaced: readonly string[] }>
  lock(input: {
    readonly userId: number
    readonly locked: boolean
    readonly reason: string | null
  }): Promise<void>
  /** Rows still `pending` and older than `before`. */
  stalled(before: Date, limit: number): Promise<readonly number[]>

  /** The object ledger, shared with F42. See `0017_avatars.sql`. */
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

/** How long an upload may stay `pending` before it is called failed. */
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

  /**
   * Validate an uploaded file and take it for processing.
   *
   * The permission is the caller's to check — this takes `mayUpload` as an
   * answer rather than a question, because group and permission reasoning does
   * not leave `@forum/authorization` (R4). The **lock** is checked here,
   * though: it is not a permission, it is a sanction on one member, and a
   * caller that had to remember it would eventually not.
   */
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
      throw new ForbiddenError(
        'A moderator has locked your avatar, so it cannot be changed.',
      )
    }

    const accepted = this.accept(input.file)

    const key = storageKeyFor('source', this.random)
    await this.deps.avatars.rememberKey(key)
    /*
     * Private, like every attachment. The download route re-checks that the
     * viewer may see the member at all, and a public object is one nobody can
     * revoke.
     */
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

  /**
   * The F42 checks, plus an avatar's own ceiling and an image-only rule.
   *
   * A PDF is a legitimate attachment and an absurd avatar, and `acceptFile`
   * would take one — so the restriction is here, where the difference between
   * the two features lives.
   */
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

  /**
   * Re-encode one pending avatar. The queued job's body.
   *
   * Idempotent, because the queue is at-least-once: a row that is no longer
   * `pending` is a no-op, and the work it would redo has already been done.
   */
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

    /*
     * Sniffed again rather than remembered. The row does not carry the type,
     * and re-reading the bytes is both cheaper than a column and correct if
     * anything ever put different bytes at that key.
     */
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

    let processed
    try {
      /*
       * The same pipeline F42 uses, at a much smaller box and with no preview.
       * An avatar renders at a fixed size in every postbit on the board, so
       * storing a 2000px original would be a cost paid by every reader of every
       * thread; and a thumbnail of a 200px image is a second lossy encode of
       * something nothing will ask for.
       */
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

  /** The member removes their own. A lock stops it, like an upload. */
  async remove(userId: number): Promise<void> {
    const current = await this.deps.avatars.find(userId)
    if (current?.locked === true) {
      throw new ForbiddenError(
        'A moderator has locked your avatar, so it cannot be changed.',
      )
    }
    const { replaced } = await this.deps.avatars.clear(userId)
    await this.sweepKeys(replaced)
  }

  /**
   * A moderator locks or unlocks one.
   *
   * The reason is required when locking, for D61's reason: "your avatar has
   * been locked" with no reason is how somebody concludes the board is broken
   * rather than that they broke a rule.
   */
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

  /** Fail uploads whose job never finished. Bounded, and safe to run twice. */
  async sweep(limit = 200): Promise<number> {
    const cutoff = new Date(
      this.now().getTime() - AVATAR_PROCESSING_GRACE_MINUTES * 60_000,
    )
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

  /** Delete an object and forget it, in that order. */
  private async discard(key: string): Promise<void> {
    await this.deps.files.delete(key)
    await this.deps.avatars.forgetKeys([key])
  }
}
