'use client'

import type { QuickReplyModel, SlotCopy } from '@meith/theme-kit'

export function QuickReply({ placeholder, children }: QuickReplyModel & { copy: SlotCopy }) {
  if (children === undefined) return null

  return <section aria-label={placeholder}>{children}</section>
}
