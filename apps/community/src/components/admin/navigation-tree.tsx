'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'

import { buttonVariants, cn } from '@meith/ui'

import { PANEL_LIST } from '@/components/shell/panel-list'
import { EMPTY_STATE } from '@/server/auth-form-state'
import { arrangeNavigationItemAction } from '@/server/navigation-admin-actions'
import {
  applyDrop,
  availableNudges,
  depthAllowedFor,
  isWhereItIs,
  type NavigationDropTarget,
  type NavigationNudge,
  nudgeTarget,
  projectDrop,
  projectionOf,
  subtreeOf,
  withoutSubtree,
} from '@/view/navigation-arrange'

import { FormError } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import {
  type AudienceChoice,
  type GroupChoice,
  NavigationItemRowForm,
  type NavigationItemValues,
  type ParentChoice,
} from './navigation-forms'

const INDENT_PX = 24

const NUDGE_KEYS: Record<NavigationNudge, string> = {
  up: 'adminNavigation.tree.nudge.up',
  down: 'adminNavigation.tree.nudge.down',
  in: 'adminNavigation.tree.nudge.in',
  out: 'adminNavigation.tree.nudge.out',
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

function NudgeIcon({ nudge }: { nudge: NavigationNudge }) {
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

export interface NavigationTreeRow extends NavigationItemValues {
  readonly depth: number
  readonly name: string
  readonly builtIn: boolean
}

interface Drag {
  readonly id: number
  readonly pointerId: number
  readonly startX: number
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
  rows: readonly NavigationTreeRow[],
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
  copy: Copy,
  outline: readonly NavigationTreeRow[],
  row: NavigationTreeRow,
  target: NavigationDropTarget,
): string {
  const parent = outline.find((entry) => entry.id === target.parentId)
  const after = outline.find((entry) => entry.id === target.afterId)

  const where =
    parent === undefined
      ? fromCopy(copy, 'adminNavigation.tree.where.topLevel')
      : formatFromCopy(copy, 'adminNavigation.tree.where.under', { parent: parent.name })
  const order =
    after === undefined
      ? fromCopy(copy, 'adminNavigation.tree.order.first')
      : formatFromCopy(copy, 'adminNavigation.tree.order.after', { after: after.name })

  return formatFromCopy(copy, 'adminNavigation.tree.placed', { name: row.name, where, order })
}

export function NavigationTree({
  rows,
  audiences,
  groups,
  parents,
  copy,
}: {
  rows: readonly NavigationTreeRow[]
  audiences: readonly AudienceChoice[]
  groups: readonly GroupChoice[]
  parents: readonly ParentChoice[]
  copy: Copy
}) {
  const [state, action, pending] = useActionState(arrangeNavigationItemAction, EMPTY_STATE)

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
          depthAllowedFor(outline, dragged.id),
        )

  const lifted =
    dragged === null ? new Set<number>() : new Set(subtreeOf(outline, dragged.id).map((r) => r.id))

  const markerBefore = projection === null ? null : (rest[projection.index]?.id ?? null)
  const markerAfter = projection === null || markerBefore !== null ? null : rest.at(-1)?.id

  const preview = (row: NavigationTreeRow, target: NavigationDropTarget): boolean => {
    if (isWhereItIs(outline, row.id, target)) return false

    setOutline(applyDrop(outline, row.id, projectionOf(outline, row.id, target)))
    setMoving(row.id)
    setSaid(sentence(copy, outline, row, target))
    return true
  }

  const commit = (row: NavigationTreeRow, target: NavigationDropTarget): void => {
    if (!preview(row, target)) return

    const form = new FormData()
    form.set('id', String(row.id))
    form.set('parentId', target.parentId === null ? '' : String(target.parentId))
    form.set('afterId', target.afterId === null ? '' : String(target.afterId))

    startTransition(() => action(form))
  }

  const start = (row: NavigationTreeRow, event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.preventDefault()

    measured.current = measure(elements.current, withoutSubtree(outline, row.id))
    event.currentTarget.setPointerCapture(event.pointerId)

    setDrag({
      id: row.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      x: event.clientX,
      y: event.clientY,
      docY: event.clientY + window.scrollY,
    })
  }

  const follow = (event: React.PointerEvent<HTMLElement>): void => {
    setDrag((current) =>
      current === null || current.pointerId !== event.pointerId
        ? current
        : { ...current, x: event.clientX, y: event.clientY, docY: event.clientY + window.scrollY },
    )
  }

  const drop = (): void => {
    if (dragged !== null && projection !== null) {
      commit(dragged, { parentId: projection.parentId, afterId: projection.afterId })
    }
    setDrag(null)
  }

  const keys = (row: NavigationTreeRow, event: React.KeyboardEvent<HTMLElement>): void => {
    const direction: NavigationNudge | null =
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

    const target = nudgeTarget(outline, row.id, direction)
    if (target !== null) commit(row, target)
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="navigation-tree-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="navigation-tree-heading" className="font-heading text-lg font-semibold">
          {fromCopy(copy, 'adminNavigation.tree.heading')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {hydrated
            ? fromCopy(copy, 'adminNavigation.tree.dragHint')
            : fromCopy(copy, 'adminNavigation.tree.arrowsHint')}
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
                'group relative flex flex-col gap-2 px-3 py-2 transition-opacity',
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

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
                  {Array.from({ length: row.depth }, (_, level) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: one spacer per depth level — the index is the depth
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
                      aria-label={formatFromCopy(copy, 'adminNavigation.tree.moveHandle', {
                        name: row.name,
                      })}
                      aria-describedby="navigation-tree-help"
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

                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{row.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.href}
                      {' · '}
                      {fromCopy(
                        copy,
                        row.builtIn ? 'adminNavigation.builtIn' : 'adminNavigation.custom',
                      )}
                      {!row.enabled && ` · ${fromCopy(copy, 'adminNavigation.hidden')}`}
                    </span>
                  </span>
                </span>

                <form
                  action={action}
                  className="flex shrink-0 items-center rounded-md border border-border bg-card"
                >
                  <input type="hidden" name="id" value={row.id} />
                  {(['up', 'down', 'in', 'out'] as const).map((direction) => (
                    <button
                      key={direction}
                      type="submit"
                      name="nudge"
                      value={direction}
                      disabled={!can[direction]}
                      onClick={() => {
                        if (!hydrated) return
                        const target = nudgeTarget(outline, row.id, direction)
                        if (target !== null) preview(row, target)
                      }}
                      aria-label={formatFromCopy(copy, NUDGE_KEYS[direction], { name: row.name })}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon' }),
                        'size-8 rounded-none border-0 border-l border-border text-muted-foreground first:border-l-0',
                      )}
                    >
                      <NudgeIcon nudge={direction} />
                    </button>
                  ))}
                </form>
              </div>

              <NavigationItemRowForm
                item={row}
                audiences={audiences}
                groups={groups}
                parents={parents}
                copy={copy}
                summary={formatFromCopy(copy, 'adminNavigation.tree.edit', { name: row.name })}
                className="rounded-md border border-border bg-card px-3"
                style={{ marginLeft: `${row.depth * INDENT_PX}px` }}
              />
            </li>
          )
        })}
      </ol>

      <p id="navigation-tree-help" className="text-xs text-muted-foreground">
        {fromCopy(copy, 'adminNavigation.tree.help')}
      </p>

      {drag !== null && dragged !== null && (
        <span
          aria-hidden
          style={{ left: `${drag.x + 14}px`, top: `${drag.y + 14}px` }}
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium shadow-elevation"
        >
          {dragged.name}
        </span>
      )}
    </section>
  )
}
