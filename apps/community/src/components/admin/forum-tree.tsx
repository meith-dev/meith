'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'

import {
  applyDrop,
  availableNudges,
  type DropTarget,
  type ForumOutlineRow,
  isWhereItIs,
  type Nudge,
  nudgeTarget,
  projectDrop,
  projectionOf,
  subtreeOfOutline,
  withoutSubtree,
} from '@meith/forums/arrange'
import { buttonVariants, cn } from '@meith/ui'

import { PANEL_LIST } from '@/components/shell/panel-list'
import { EMPTY_STATE } from '@/server/auth-form-state'
import { arrangeForumAction } from '@/server/forum-admin-actions'

import { FormError } from '../auth/form-controls'

const INDENT_PX = 24

const NUDGE_LABELS: Record<Nudge, string> = {
  up: 'up',
  down: 'down',
  in: 'in, under the forum above it',
  out: 'out of its parent',
}

const ICON = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'size-3.5 shrink-0',
} as const

function GripIcon() {
  return (
    <svg {...ICON} aria-hidden="true" className="size-4 shrink-0">
      <path d="M6 3h.01M6 8h.01M6 13h.01M10 3h.01M10 8h.01M10 13h.01" strokeWidth={2} />
    </svg>
  )
}

function NudgeIcon({ nudge }: { nudge: Nudge }) {
  if (nudge === 'up') {
    return (
      <svg {...ICON} aria-hidden="true">
        <path d="M8 13V3M4 7l4-4 4 4" />
      </svg>
    )
  }
  if (nudge === 'down') {
    return (
      <svg {...ICON} aria-hidden="true">
        <path d="M8 3v10M4 9l4 4 4-4" />
      </svg>
    )
  }
  if (nudge === 'in') {
    return (
      <svg {...ICON} aria-hidden="true">
        <path d="M3 8h8M8 5l3 3-3 3M14 3v10" />
      </svg>
    )
  }
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M13 8H5M8 5 5 8l3 3M2 3v10" />
    </svg>
  )
}

function KindIcon({ type }: { type: ForumOutlineRow['type'] }) {
  if (type === 'category') {
    return (
      <svg {...ICON} aria-hidden="true">
        <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 2H13a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5Z" />
      </svg>
    )
  }
  if (type === 'link') {
    return (
      <svg {...ICON} aria-hidden="true">
        <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.75.75M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.75-.75" />
      </svg>
    )
  }
  return (
    <svg {...ICON} aria-hidden="true">
      <path d="M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v8A1.5 1.5 0 0 1 12 13.5H4A1.5 1.5 0 0 1 2.5 12ZM5 6h6M5 9h4" />
    </svg>
  )
}

interface Drag {
  readonly id: number
  readonly pointerId: number
  readonly startX: number
  readonly startDocY: number
  readonly x: number
  readonly y: number
  readonly docY: number
}

interface Measured {
  readonly id: number
  readonly middle: number
}

function measure(
  elements: ReadonlyMap<number, HTMLElement>,
  rows: readonly ForumOutlineRow[],
): Measured[] {
  return rows.flatMap((row) => {
    const element = elements.get(row.id)
    if (element === undefined) return []
    const box = element.getBoundingClientRect()
    return [{ id: row.id, middle: box.top + box.height / 2 + window.scrollY }]
  })
}

function insertionIndex(measured: readonly Measured[], docY: number): number {
  const at = measured.findIndex((row) => docY < row.middle)
  return at === -1 ? measured.length : at
}

function sentence(
  outline: readonly ForumOutlineRow[],
  row: ForumOutlineRow,
  target: DropTarget,
): string {
  const parent = outline.find((entry) => entry.id === target.parentId)
  const after = outline.find((entry) => entry.id === target.afterId)

  const where = parent === undefined ? 'at the top level' : `inside ${parent.title}`
  const order = after === undefined ? 'first' : `after ${after.title}`

  return `${row.title}: ${where}, ${order}.`
}

export function ForumTree({ rows }: { rows: readonly ForumOutlineRow[] }) {
  const [state, action, pending] = useActionState(arrangeForumAction, EMPTY_STATE)

  const [given, setGiven] = useState(rows)
  const [outline, setOutline] = useState(rows)
  const [failed, setFailed] = useState(state.error)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [moving, setMoving] = useState<number | null>(null)
  const [said, setSaid] = useState('')
  const [hydrated, setHydrated] = useState(false)

  const elements = useRef(new Map<number, HTMLElement>())
  const measured = useRef<Measured[]>([])

  if (given !== rows) {
    setGiven(rows)
    setOutline(rows)
    setMoving(null)
  }

  if (failed !== state.error) {
    setFailed(state.error)
    if (state.error !== undefined) {
      setOutline(rows)
      setMoving(null)
    }
  }

  useEffect(() => setHydrated(true), [])

  const dragged = drag === null ? null : (outline.find((row) => row.id === drag.id) ?? null)
  const rest = dragged === null ? outline : withoutSubtree(outline, dragged.id)

  const projection =
    dragged === null || drag === null
      ? null
      : projectDrop(
          rest,
          insertionIndex(measured.current, drag.docY),
          dragged.depth + Math.round((drag.x - drag.startX) / INDENT_PX),
        )

  const lifted =
    dragged === null
      ? new Set<number>()
      : new Set(subtreeOfOutline(outline, dragged.id).map((row) => row.id))

  const markerBefore = projection === null ? null : (rest[projection.index]?.id ?? null)
  const markerAfter = projection === null || markerBefore !== null ? null : rest.at(-1)?.id

  const preview = (row: ForumOutlineRow, target: DropTarget): boolean => {
    if (isWhereItIs(outline, row.id, target)) return false

    setOutline(applyDrop(outline, row.id, projectionOf(outline, row.id, target)))
    setMoving(row.id)
    setSaid(sentence(outline, row, target))
    return true
  }

  const commit = (row: ForumOutlineRow, target: DropTarget): void => {
    if (!preview(row, target)) return

    const form = new FormData()
    form.set('forumId', String(row.id))
    form.set('parentId', target.parentId === null ? '' : String(target.parentId))
    form.set('afterId', target.afterId === null ? '' : String(target.afterId))

    startTransition(() => action(form))
  }

  const nudge = (row: ForumOutlineRow, direction: Nudge): void => {
    const target = nudgeTarget(outline, row.id, direction)
    if (target !== null) commit(row, target)
  }

  const previewNudge = (row: ForumOutlineRow, direction: Nudge): void => {
    const target = nudgeTarget(outline, row.id, direction)
    if (target !== null) preview(row, target)
  }

  const start = (row: ForumOutlineRow, event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.preventDefault()

    measured.current = measure(elements.current, withoutSubtree(outline, row.id))
    event.currentTarget.setPointerCapture(event.pointerId)

    setDrag({
      id: row.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startDocY: event.clientY + window.scrollY,
      x: event.clientX,
      y: event.clientY,
      docY: event.clientY + window.scrollY,
    })
  }

  const follow = (event: React.PointerEvent<HTMLElement>): void => {
    setDrag((current) =>
      current === null || current.pointerId !== event.pointerId
        ? current
        : {
            ...current,
            x: event.clientX,
            y: event.clientY,
            docY: event.clientY + window.scrollY,
          },
    )
  }

  const drop = (): void => {
    if (dragged !== null && projection !== null) {
      commit(dragged, { parentId: projection.parentId, afterId: projection.afterId })
    }
    setDrag(null)
  }

  const keys = (row: ForumOutlineRow, event: React.KeyboardEvent<HTMLElement>): void => {
    const direction: Nudge | null =
      event.key === 'ArrowUp'
        ? 'up'
        : event.key === 'ArrowDown'
          ? 'down'
          : event.key === 'ArrowRight'
            ? 'in'
            : event.key === 'ArrowLeft'
              ? 'out'
              : null

    if (direction === null) return
    event.preventDefault()
    nudge(row, direction)
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="forum-tree-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="forum-tree-heading" className="font-heading text-lg font-semibold">
          The tree
        </h2>
        <p className="text-xs text-muted-foreground">
          {hydrated
            ? 'Drag a row by its handle to move it, sideways to nest it. The arrows do the same from the keyboard.'
            : 'Use the arrows to move a forum up, down, in or out.'}
        </p>
      </div>

      <FormError message={state.error} />

      <p role="status" className="sr-only">
        {said}
      </p>

      <ol className={PANEL_LIST}>
        {outline.map((row) => {
          const can = availableNudges(outline, row.id)
          const held = drag !== null && drag.id === row.id

          return (
            <li
              key={row.id}
              ref={(element) => {
                if (element === null) elements.current.delete(row.id)
                else elements.current.set(row.id, element)
              }}
              className={cn(
                'group relative flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 transition-opacity hover:bg-muted/40',
                lifted.has(row.id) && 'opacity-40',
                held && 'bg-muted',
                moving === row.id && pending && 'opacity-60',
              )}
            >
              {projection !== null && (markerBefore === row.id || markerAfter === row.id) && (
                <span
                  aria-hidden
                  style={{ left: `${projection.depth * INDENT_PX + 12}px` }}
                  className={cn(
                    'pointer-events-none absolute right-3 z-10 h-0.5 rounded-full bg-primary',
                    markerBefore === row.id ? '-top-px' : '-bottom-px',
                  )}
                />
              )}

              <span className="flex min-w-0 flex-1 basis-full items-center gap-2 self-stretch sm:basis-0">
                {Array.from({ length: row.depth }, (_, level) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: one indentation spacer per depth level — the index is the depth
                    key={level}
                    aria-hidden
                    style={{ width: `${INDENT_PX - 8}px` }}
                    className="-my-2 shrink-0 self-stretch border-l border-border"
                  />
                ))}

                {hydrated && (
                  <button
                    type="button"
                    onPointerDown={(event) => start(row, event)}
                    onPointerMove={follow}
                    onPointerUp={drop}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(event) => keys(row, event)}
                    aria-label={`Move ${row.title}`}
                    aria-describedby="forum-tree-help"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon' }),
                      'size-7 cursor-grab touch-none text-muted-foreground/60',
                      'group-hover:text-muted-foreground focus-visible:text-foreground',
                      held && 'cursor-grabbing bg-muted text-foreground',
                    )}
                  >
                    <GripIcon />
                  </button>
                )}

                <span className="text-muted-foreground">
                  <KindIcon type={row.type} />
                </span>

                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{row.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {row.type} · /{row.slug}
                  </span>
                </span>
              </span>

              <form
                action={action}
                className="flex shrink-0 items-center rounded-md border border-border bg-card"
              >
                <input type="hidden" name="forumId" value={row.id} />
                {(['up', 'down', 'in', 'out'] as const).map((direction) => (
                  <button
                    key={direction}
                    type="submit"
                    name="nudge"
                    value={direction}
                    disabled={!can[direction]}
                    onClick={() => {
                      if (hydrated) previewNudge(row, direction)
                    }}
                    aria-label={`Move ${row.title} ${NUDGE_LABELS[direction]}`}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon' }),
                      'size-8 rounded-none border-0 border-l border-border first:border-l-0 text-muted-foreground',
                    )}
                  >
                    <NudgeIcon nudge={direction} />
                  </button>
                ))}
              </form>

              <span className="ml-auto flex shrink-0 items-center gap-3 text-xs sm:ml-0 sm:gap-2 sm:pl-1">
                <a
                  href={`/admin/forums/${row.id}`}
                  aria-label={`Options for ${row.title}`}
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Options
                </a>
                <a
                  href={`/admin/forums/${row.id}/permissions`}
                  aria-label={`Permissions for ${row.title}`}
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Permissions
                </a>
              </span>
            </li>
          )
        })}
      </ol>

      <p id="forum-tree-help" className="text-xs text-muted-foreground">
        Moving a forum takes its subforums with it, and they inherit from wherever they land.
        Re-parenting asks for your password again if it is more than fifteen minutes since you last
        confirmed it; reordering under the same parent does not.
      </p>

      {drag !== null && dragged !== null && (
        <span
          aria-hidden
          style={{ left: `${drag.x + 14}px`, top: `${drag.y + 14}px` }}
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium shadow-elevation"
        >
          {dragged.title}
        </span>
      )}
    </section>
  )
}
