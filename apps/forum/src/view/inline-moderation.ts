/**
 * F52's view layer: which rows get a checkbox, and what it says.
 *
 * Pure, and separate from the page for the reason every view model here is —
 * the decision "should this row be selectable" is worth testing without a
 * database, a request, or a theme.
 */
import type { InlineTool } from '@forum/moderation'
import type { SelectionModel } from '@forum/theme-kit'

/**
 * The id the checkboxes point at.
 *
 * One constant rather than a prop threaded through two pages: the value has to
 * match between the `form` attribute on every checkbox and the `id` on the bar,
 * and a mismatch is silent — the boxes simply stop being submitted, and the
 * moderator sees "Select at least one item" while looking at twelve ticks.
 */
export const INLINE_FORM_ID = 'inline-moderation'

/** Which tools this viewer may offer at all. Empty means no bar and no boxes. */
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

/**
 * The checkbox for one row, or `null`.
 *
 * The label is the row's own title because a screen-reader user tabbing a
 * listing of forty threads gets forty controls announced, and "checkbox" forty
 * times is not a listing they can moderate.
 */
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

/**
 * What the bar reports after a submission, assembled from the query string.
 *
 * Four numbers rather than "done", for F48's reason: a moderator who ticked
 * twelve boxes and moved nine has to be told, or the screen and the board
 * disagree about what just happened and only one of them is right.
 */
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
