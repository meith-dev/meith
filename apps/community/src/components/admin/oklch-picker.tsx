"use client"

/**
 * A colour picker that speaks the board's own colour space.
 *
 * ## Why not `<input type="color">`, which is what this replaces
 *
 * Because it speaks six-digit hex and nothing else, and every colour this board
 * ships is OKLCH. That mismatch is not cosmetic:
 *
 *  - **it silently mangles what it cannot show.** Handed `oklch(0.205 0 0)` the
 *    native control displays black *and reports black when read* — so opening
 *    the theme editor and saving without touching anything rewrote the palette
 *    as hex. The old editor worked around this by never handing it a value it
 *    could not parse, which meant the picker was simply unavailable for most
 *    tokens;
 *  - **it cannot do the two things an operator wants.** "The same colour but
 *    lighter" and "the same lightness, a different hue" are one slider each
 *    here and are a guess in a hex wheel. The default palette is built on that
 *    property — every grey is one axis of one colour — and a hex control throws
 *    it away.
 *
 * ## The tracks are the interface
 *
 * Each slider's background is a gradient through the colour space along that
 * axis, recomputed from the other two. So the lightness track shows *this*
 * hue getting lighter, and the hue track shows *this* lightness and chroma
 * going round — you aim at the colour you want rather than hunting for it.
 * Browsers interpolate `oklch()` gradients natively, so this is a background
 * image and no canvas.
 *
 * ## Out of gamut is said out loud
 *
 * OKLCH describes colours sRGB cannot show. Past the edge the swatch stops
 * changing however far the chroma slider goes, which looks like a broken
 * control — so the component says the screen cannot show it and offers the
 * nearest colour it can. `oklchToRgb` reports this; see `@/view/oklch`.
 *
 * ## The text box is still the field that posts
 *
 * Same arrangement the old editor had, for the same reason: the sliders drive
 * a text input, and the text input is what the form submits. An empty box is
 * "use the theme's value", which no slider position can express — and the box
 * accepts what the sliders cannot, like `color-mix()` or a bare hex somebody
 * pasted from a brand guide.
 */
import { useId, useState } from "react"

import {
  MAX_CHROMA,
  formatOklch,
  oklchToRgb,
  parseColour,
  rgbToHex,
  type Oklch,
} from "@/view/oklch"

/** Where the sliders sit when the field is empty and nothing was shipped. */
const NEUTRAL: Oklch = { l: 0.6, c: 0, h: 0 }

const TRACK =
  "h-6 w-full cursor-pointer appearance-none rounded-md border border-border bg-cover [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-foreground [&::-webkit-slider-thumb]:bg-background [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-foreground [&::-moz-range-thumb]:bg-background"

/** A gradient along one axis, holding the other two where they are. */
function track(stops: readonly Oklch[]): string {
  return `linear-gradient(to right, ${stops.map((stop) => formatOklch(stop)).join(", ")})`
}

function ramp(count: number, at: (t: number) => Oklch): Oklch[] {
  return Array.from({ length: count }, (_, index) => at(index / (count - 1)))
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  gradient,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  gradient: string
  display: string
  onChange: (next: number) => void
}) {
  const id = useId()

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <label htmlFor={id}>{label}</label>
        <span className="font-mono tabular-nums">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ backgroundImage: gradient }}
        className={TRACK}
      />
    </div>
  )
}

export function OklchPicker({
  name,
  describes,
  value,
  shipped,
  onChange,
}: {
  /** The form field. The text input carries it; the sliders do not. */
  name: string
  /**
   * What this swatch adjusts, in words — "Button and link accent, light".
   *
   * The theme editor renders one picker per token per scheme, which on the
   * default theme is **eighty buttons on one page** whose accessible name was
   * the same four words. A screen reader's element list, or anything that reads
   * the page out of order, offered eighty identical "Adjust this colour" and no
   * way to tell which was which — the field beside each one is labelled, and the
   * button that opens its sliders was not (WCAG 2.4.6).
   *
   * Optional because the swatch still says what it does without it; the caller
   * supplies the context only it knows.
   */
  describes?: string | undefined
  /** What is in the field now. Empty means "not overridden". */
  value: string
  /** The theme's own value, so an empty field still opens somewhere sensible. */
  shipped?: string | undefined
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)

  /*
   * Parsed on every render rather than held in state. The text box is the
   * single source of truth — a second copy in state is how a picker and its
   * field drift apart when something else clears the field, which the "use the
   * theme's value" button does.
   */
  const parsed = parseColour(value) ?? (shipped === undefined ? null : parseColour(shipped))
  const colour = parsed ?? NEUTRAL
  const { rgb, inGamut } = oklchToRgb(colour)

  const set = (next: Partial<Oklch>): void => onChange(formatOklch({ ...colour, ...next }))

  const opens = describes === undefined ? 'Adjust this colour' : `Adjust ${describes}`
  const hides =
    describes === undefined
      ? 'Hide the colour sliders'
      : `Hide the sliders for ${describes}`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/*
          The swatch is a button that opens the sliders, not decoration. It
          shows the *clamped* colour, which is what a screen would show —
          claiming otherwise beside a warning that says it cannot be shown
          would be the picker arguing with itself.
        */}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          title={open ? hides : opens}
          style={{ background: rgbToHex(rgb) }}
          className="size-9 shrink-0 rounded-md border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="sr-only">{opens}</span>
        </button>

        <input
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={shipped}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
          <Slider
            label="Lightness"
            value={colour.l}
            min={0}
            max={1}
            step={0.001}
            display={colour.l.toFixed(3)}
            gradient={track(ramp(11, (t) => ({ ...colour, l: t })))}
            onChange={(l) => set({ l })}
          />
          <Slider
            label="Chroma"
            value={colour.c}
            min={0}
            max={MAX_CHROMA}
            step={0.001}
            display={colour.c.toFixed(3)}
            gradient={track(ramp(11, (t) => ({ ...colour, c: t * MAX_CHROMA })))}
            onChange={(c) => set({ c })}
          />
          <Slider
            label="Hue"
            value={colour.h}
            min={0}
            max={360}
            step={0.5}
            display={`${colour.h.toFixed(1)}°`}
            /*
             * Thirteen stops rather than eleven so the wheel closes on itself:
             * every 30° plus a repeat of 0 at the end, or the gradient
             * interpolates the long way round from 330° back to red.
             */
            gradient={track(ramp(13, (t) => ({ ...colour, h: t * 360 })))}
            onChange={(h) => set({ h })}
          />

          {!inGamut && (
            <p role="status" className="text-xs text-muted-foreground">
              No ordinary screen can show this colour — the swatch is the
              closest it can manage. Lower the chroma until it stops changing.
            </p>
          )}

          {value !== "" && (
            <div>
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-xs font-medium underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                Clear, and use the value it ships with
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
