"use client"

/**
 * The palette, as a palette.
 *
 * ## Why the list it replaces was the wrong shape
 *
 * A theme has forty-four tokens and the editor showed them as forty-four rows,
 * each about a hundred and twenty pixels tall for a value that is one colour.
 * Folding the groups and adding a filter box helped and both treat the symptom:
 * the thing being edited is a **palette**, which is a visual object, and a list
 * is the one presentation that cannot show it. Nothing in a column of rows tells
 * an operator that six of their greys are one ramp, that `surface` and `card`
 * are now within a hair of each other so the band has disappeared, or that one
 * semantic colour is the odd one out.
 *
 * So every token is a swatch, the whole palette is about a screen, and the full
 * control — picker, text box, the theme's own value, the contrast of every pair
 * the token takes part in — opens under the group when a swatch is pressed.
 * Browsing gets an order of magnitude denser; editing is exactly what it was.
 *
 * ## One swatch, two schemes
 *
 * Each swatch is split: light on the left, dark on the right. Two separate grids
 * would double the length and put the one comparison that matters — *is this
 * colour doing the same job in both schemes?* — a scroll apart, which is the
 * mistake the two-field row was built to prevent in the first place.
 *
 * ## A token that is not a colour gets its value, not a square
 *
 * `radius`, the font stacks and the shadow geometry have no colour to show, and
 * a grey square painted with `0.5rem` is a square painted with nothing. They
 * show the value itself in the board's monospace face, truncated — which is also
 * the only honest preview of a font stack in eleven characters.
 */

import type { EditableToken } from "@/view/theme-draft"

/** What the board is doing with one token, as the grid marks it. */
export type CellState = "clean" | "saved" | "unsaved"

export interface PaletteCell {
  readonly token: EditableToken
  /** The effective values — what a save would paint, per scheme. */
  readonly light: string
  readonly dark: string
  readonly state: CellState
  /** False while a filter is on and this token does not answer it. */
  readonly visible: boolean
}

const STATE_NOTE: Readonly<Record<CellState, string>> = {
  clean: "",
  saved: "changed by this board",
  unsaved: "changed, not saved yet",
}

/**
 * The two halves.
 *
 * Painted through `style` rather than a class, so a half-typed value is a
 * property the browser drops rather than a string this component has to
 * sanitise — the same rule the live sample follows.
 */
function Swatch({ cell }: { cell: PaletteCell }) {
  if (cell.token.kind !== "colour") {
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
          ? "border-primary bg-accent"
          : cell.state === "unsaved"
            ? "border-primary"
            : cell.state === "saved"
              ? "border-foreground/40"
              : "border-border hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <Swatch cell={cell} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">{cell.token.label}</span>
        <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">
          {cell.token.name}
        </span>
        {/*
          The state is a word as well as a border colour. Every other place on
          this board that marks something with a hue also says it, and a grid
          where "changed" is a slightly different grey line is the clearest case
          for the rule there has ever been.
        */}
        {note !== "" && (
          <span
            className={`truncate text-[0.6875rem] ${
              cell.state === "unsaved" ? "font-medium text-primary" : "text-muted-foreground"
            }`}
          >
            {note}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * One group's swatches.
 *
 * `auto-fill` rather than a fixed column count: this grid is rendered in a
 * column whose width depends on the panel rail, the viewport and whether the
 * sample is beside it, and a count chosen for one of those is wrong in the other
 * two.
 */
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
