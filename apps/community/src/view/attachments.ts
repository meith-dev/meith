import {
  type AttachmentRecord,
  type AttachmentStatus,
  attachmentType,
} from '@meith/attachments/types'
import type { PostAttachmentModel } from '@meith/theme-kit'

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
    thumbnailHref: type.inline && record.thumbnailKey !== null ? thumbnailHref(record.id) : null,
    width: record.width,
    height: record.height,
  }
}

export interface EditableAttachment {
  readonly id: number
  readonly filename: string
  readonly size: string
  readonly status: AttachmentStatus
  readonly isImage: boolean
  readonly href: string | null
  readonly thumbnailHref: string | null
}

export function editableAttachment(record: AttachmentRecord): EditableAttachment {
  const ready = record.status === 'ready' && record.storageKey !== null
  const type = attachmentType(record.contentType)

  return {
    id: record.id,
    filename: record.filename,
    size: formatBytes(record.sizeBytes),
    status: record.status,
    isImage: ready && type?.inline === true,
    href: ready ? attachmentHref(record.id) : null,
    thumbnailHref:
      ready && type?.inline === true && record.thumbnailKey !== null
        ? thumbnailHref(record.id)
        : null,
  }
}

export function attachmentsByPost(
  records: readonly AttachmentRecord[],
): ReadonlyMap<number, readonly PostAttachmentModel[]> {
  const byPost = new Map<number, PostAttachmentModel[]>()

  for (const record of records) {
    if (record.postId === null) continue
    const model = attachmentModel(record)
    if (model === null) continue
    const list = byPost.get(record.postId)
    if (list === undefined) byPost.set(record.postId, [model])
    else list.push(model)
  }

  return byPost
}
