'use client'

import type { EditableToken } from '@/view/theme-draft'

export type CellState = 'clean' | 'saved' | 'unsaved'

export interface PaletteCell {
  readonly token: EditableToken
  readonly light: string
  readonly dark: string
  readonly state: CellState
  readonly visible: boolean
}

const STATE_NOTE: Readonly<Record<CellState, string>> = {
  clean: '',
  saved: 'changed by this board',
  unsaved: 'changed, not saved yet',
}

function Swatch({ cell }: { cell: PaletteCell }) {
  if (cell.token.kind !== 'colour') {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted px-1">
        <span className="truncate font-mono text-[0.5625rem] text-muted-foreground">
          {cell.light}
        </span>
      </span>
    )
  }

  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 overflow-hidden rounded-md border border-border"
    >
      <span className="flex-1" style={{ background: cell.light }} />
      <span className="flex-1" style={{ background: cell.dark }} />
    </span>
  )
}

function Cell({
  cell,
  expanded,
  onSelect,
}: {
  cell: PaletteCell
  expanded: boolean
  onSelect: () => void
}) {
  const note = STATE_NOTE[cell.state]

  return (
    <button
      type="button"
      hidden={!cell.visible}
      aria-expanded={expanded}
      aria-controls={`token-${cell.token.name}`}
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-md border p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        expanded
          ? 'border-primary bg-accent'
          : cell.state === 'unsaved'
            ? 'border-primary'
            : cell.state === 'saved'
              ? 'border-foreground/40'
              : 'border-border hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      <Swatch cell={cell} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">{cell.token.label}</span>
        <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">
          {cell.token.name}
        </span>
        {note !== '' && (
          <span
            className={`truncate text-[0.6875rem] ${
              cell.state === 'unsaved' ? 'font-medium text-primary' : 'text-muted-foreground'
            }`}
          >
            {note}
          </span>
        )}
      </span>
    </button>
  )
}

export function PaletteGrid({
  cells,
  selected,
  onSelect,
}: {
  cells: readonly PaletteCell[]
  selected: string | null
  onSelect: (name: string) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
      {cells.map((cell) => (
        <Cell
          key={cell.token.name}
          cell={cell}
          expanded={selected === cell.token.name}
          onSelect={() => onSelect(cell.token.name)}
        />
      ))}
    </div>
  )
}
