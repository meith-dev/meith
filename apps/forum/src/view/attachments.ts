/**
 * F42's view model: attachment rows to something a theme can render.
 *
 * Pure, and deliberately the only place that decides what a reader sees of an
 * attachment. Two rules live here and nowhere else.
 *
 * **A post's list contains only what can be downloaded.** `pending` and
 * `failed` rows are dropped rather than rendered as "processing" or "broken":
 * an image appears a minute after the post on a busy board, and a link that
 * 404s is worse than a link that is not there yet. The uploader learns about a
 * failure from their own post, which F71's attachment screen will show — until
 * then a failed upload is silent, and that is named as the gap it is.
 *
 * **A size is formatted here.** A theme is not a unit converter, and two themes
 * rounding differently would make the same file two sizes.
 */
/* The leaf module: `formatBytes` is used by a client component too. */
import { attachmentType, type AttachmentRecord } from '@meith/attachments/types'
import type { PostAttachmentModel } from '@meith/theme-kit'

/** "820 KB", "1.4 MB". Binary units, because that is what a file manager says. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} bytes`
}

export function attachmentHref(id: number): string {
  return `/attachment/${id}`
}

export function thumbnailHref(id: number): string {
  return `/attachment/${id}/thumb`
}

/** One row as a theme sees it, or null when it is not downloadable. */
export function attachmentModel(record: AttachmentRecord): PostAttachmentModel | null {
  if (record.status !== 'ready' || record.storageKey === null) return null

  const type = attachmentType(record.contentType)
  if (type === undefined) return null

  return {
    id: record.id,
    filename: record.filename,
    size: formatBytes(record.sizeBytes),
    isImage: type.inline,
    href: attachmentHref(record.id),
    /*
     * Null when the image already fits the thumbnail box — `resizeToFit`
     * declined to shrink it, so the processor stored no second object. A theme
     * writes `thumbnailHref ?? href` and gets the right picture either way.
     */
    thumbnailHref:
      type.inline && record.thumbnailKey !== null ? thumbnailHref(record.id) : null,
    width: record.width,
    height: record.height,
  }
}

/**
 * Group a page's attachments by post.
 *
 * Preserves the repository's order — by post, then by id, which is the order
 * they were uploaded — so a theme never sorts.
 */
export function attachmentsByPost(
  records: readonly AttachmentRecord[],
): ReadonlyMap<number, readonly PostAttachmentModel[]> {
  const byPost = new Map<number, PostAttachmentModel[]>()

  for (const record of records) {
    const model = attachmentModel(record)
    if (model === null) continue
    const list = byPost.get(record.postId)
    if (list === undefined) byPost.set(record.postId, [model])
    else list.push(model)
  }

  return byPost
}
