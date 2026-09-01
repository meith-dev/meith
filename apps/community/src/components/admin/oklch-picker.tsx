'use client'

import { useId, useState } from 'react'

import {
  formatOklch,
  MAX_CHROMA,
  type Oklch,
  oklchToRgb,
  parseColour,
  rgbToHex,
} from '@meith/theme-kit'
import { textLinkVariants } from '@meith/ui'

import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'

const NEUTRAL: Oklch = { l: 0.6, c: 0, h: 0 }

const TRACK =
  'h-6 w-full cursor-pointer appearance-none rounded-md border border-border bg-cover [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-foreground [&::-webkit-slider-thumb]:bg-background [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-foreground [&::-moz-range-thumb]:bg-background'

function track(stops: readonly Oklch[]): string {
  return `linear-gradient(to right, ${stops.map((stop) => formatOklch(stop)).join(', ')})`
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
  copy,
  value,
  shipped,
  onChange,
}: {
  name: string
  describes?: string | undefined
  copy: Copy
  value: string
  shipped?: string | undefined
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)

  const parsed = parseColour(value) ?? (shipped === undefined ? null : parseColour(shipped))
  const colour = parsed ?? NEUTRAL
  const { rgb, inGamut } = oklchToRgb(colour)

  const set = (next: Partial<Oklch>): void => onChange(formatOklch({ ...colour, ...next }))

  const opens =
    describes === undefined
      ? fromCopy(copy, 'adminTheme.oklch.adjustColour')
      : formatFromCopy(copy, 'adminTheme.oklch.adjust', { describes })
  const hides =
    describes === undefined
      ? fromCopy(copy, 'adminTheme.oklch.hideSliders')
      : formatFromCopy(copy, 'adminTheme.oklch.hideSlidersFor', { describes })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
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
            label={fromCopy(copy, 'adminTheme.oklch.lightness')}
            value={colour.l}
            min={0}
            max={1}
            step={0.001}
            display={colour.l.toFixed(3)}
            gradient={track(ramp(11, (t) => ({ ...colour, l: t })))}
            onChange={(l) => set({ l })}
          />
          <Slider
            label={fromCopy(copy, 'adminTheme.oklch.chroma')}
            value={colour.c}
            min={0}
            max={MAX_CHROMA}
            step={0.001}
            display={colour.c.toFixed(3)}
            gradient={track(ramp(11, (t) => ({ ...colour, c: t * MAX_CHROMA })))}
            onChange={(c) => set({ c })}
          />
          <Slider
            label={fromCopy(copy, 'adminTheme.oklch.hue')}
            value={colour.h}
            min={0}
            max={360}
            step={0.5}
            display={`${colour.h.toFixed(1)}°`}
            gradient={track(ramp(13, (t) => ({ ...colour, h: t * 360 })))}
            onChange={(h) => set({ h })}
          />

          {!inGamut && (
            <p role="status" className="text-xs text-muted-foreground">
              {fromCopy(copy, 'adminTheme.oklch.gamut')}
            </p>
          )}

          {value !== '' && (
            <div>
              <button
                type="button"
                onClick={() => onChange('')}
                className={textLinkVariants({ tone: 'inherit', size: 'xs' })}
              >
                {fromCopy(copy, 'adminTheme.oklch.clear')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
