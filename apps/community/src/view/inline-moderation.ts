import type { InlineTool } from '@meith/moderation'
import type { SelectionModel } from '@meith/theme-kit'

export const INLINE_FORM_ID = 'inline-moderation'

export interface InlineToolAvailability {
  readonly approve: boolean
  readonly lock: boolean
  readonly stick: boolean
  readonly move: boolean
  readonly delete: boolean
}

export const NO_INLINE_TOOLS: InlineToolAvailability = {
  approve: false,
  lock: false,
  stick: false,
  move: false,
  delete: false,
}

export function anyInlineTool(available: InlineToolAvailability): boolean {
  return (
    available.approve ||
    available.lock ||
    available.stick ||
    available.move ||
    available.delete
  )
}

export function selectionFor(
  kind: 'thread' | 'post',
  id: number,
  label: string,
  offered: boolean,
): SelectionModel | null {
  if (!offered) return null
  return {
    name: 'item',
    value: `${kind}:${id}`,
    formId: INLINE_FORM_ID,
    label: `Select ${label} for moderation`,
  }
}

export function inlineOutcomeNotice(query: {
  readonly did?: string | undefined
  readonly n?: string | undefined
  readonly refused?: string | undefined
  readonly gone?: string | undefined
  readonly skipped?: string | undefined
}): string | null {
  const tool = query.did
  if (tool === undefined) return null
  const applied = count(query.n)
  const parts = [`${applied} ${applied === 1 ? 'item' : 'items'} ${PAST_TENSE[tool] ?? tool}.`]

  const refused = count(query.refused)
  if (refused > 0) parts.push(`${refused} refused — you cannot do that there.`)
  const gone = count(query.gone)
  if (gone > 0) parts.push(`${gone} no longer available.`)
  const skipped = count(query.skipped)
  if (skipped > 0) parts.push(`${skipped} already in that state.`)

  return parts.join(' ')
}

function count(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) return 0
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : 0
}

const PAST_TENSE: Readonly<Record<string, string>> = {
  approve: 'approved',
  delete: 'deleted',
  restore: 'restored',
  lock: 'locked',
  unlock: 'unlocked',
  stick: 'pinned',
  unstick: 'unpinned',
  move: 'moved',
} satisfies Readonly<Record<InlineTool, string>>
