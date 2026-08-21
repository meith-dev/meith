import 'server-only'

import type { AttachmentRecord } from '@meith/attachments'
import { escapeAttribute, escapeHtml } from '@meith/markdown'

import { attachmentModel } from '../view/attachments'
import { getContainer } from './container'

const ATTACHMENT_PLACEHOLDER = /<span class="md-attachment" data-attachment-id="(\d+)"><\/span>/g

function renderAttachment(record: AttachmentRecord): string {
  const model = attachmentModel(record)
  if (model === null) return ''

  if (model.isImage) {
    const src = model.thumbnailHref ?? model.href
    return (
      `<a href="${escapeAttribute(model.href)}" class="md-attachment md-attachment-image">` +
      `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(model.filename)}" loading="lazy"></a>`
    )
  }

  return (
    `<a href="${escapeAttribute(model.href)}" class="md-attachment md-attachment-file">` +
    `${escapeHtml(model.filename)} <span class="md-attachment-size">(${escapeHtml(model.size)})</span></a>`
  )
}

// Whether this viewer may place *this* attachment inline in *this* text — not
// whether they may download it, which the attachment route re-checks on every
// request regardless (see resolveDownload in attachments.ts). This check only
// keeps a member from naming an id that was never theirs: their own pending
// upload, or one already claimed by the very post being rendered.
function mayInline(
  record: AttachmentRecord,
  context: { readonly viewerUserId: number | null; readonly postId: number | null },
): boolean {
  if (context.viewerUserId !== null && record.uploaderUserId === context.viewerUserId) return true
  return context.postId !== null && record.postId === context.postId
}

/**
 * Resolves packages/markdown's `[attachment=id]` placeholders into real
 * markup, run once at write time (see markdown-pipeline.ts) alongside
 * highlighting and embeds. An id nobody may place here — unrecognized, not
 * ready, not theirs — resolves to nothing: the placeholder disappears rather
 * than leaking whether the id exists.
 */
export async function resolveInlineAttachments(
  html: string,
  context: { readonly viewerUserId: number | null; readonly postId: number | null },
): Promise<string> {
  if (!html.includes('md-attachment')) return html

  const ids = [
    ...new Set([...html.matchAll(ATTACHMENT_PLACEHOLDER)].map((match) => Number(match[1]))),
  ]
  if (ids.length === 0) return html

  const { attachments } = getContainer()
  if (attachments === null) return html.replace(ATTACHMENT_PLACEHOLDER, '')

  const found = await Promise.all(ids.map((id) => attachments.findById(id)))
  const byId = new Map(
    found
      .filter((record): record is AttachmentRecord => record !== null)
      .map((record) => [record.id, record]),
  )

  return html.replace(ATTACHMENT_PLACEHOLDER, (_whole, rawId: string) => {
    const record = byId.get(Number(rawId))
    if (record === undefined || !mayInline(record, context)) return ''
    return renderAttachment(record)
  })
}
