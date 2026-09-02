'use client'

import { useActionState } from 'react'

import { setSchemeAction } from '@/server/appearance-actions'
import {
  COLOUR_SCHEMES,
  type ColourSchemePreference,
  colorSchemeProperty,
  schemeClass,
} from '@/view/theme-preference'

import { PendingButton } from '../auth/form-controls'
import { ProgressiveMarker } from '../content/progressive-marker'

const EMPTY: { scheme?: ColourSchemePreference } = {}

function applySchemeImmediately(scheme: ColourSchemePreference): void {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  const applied = schemeClass(scheme)
  if (applied !== '') root.classList.add(applied)
  root.style.colorScheme = colorSchemeProperty(scheme)
}

export function SchemeToggle({
  scheme,
  groupLabel,
  labels,
  icons,
}: {
  scheme: ColourSchemePreference
  groupLabel: string
  labels: Readonly<Record<ColourSchemePreference, string>>
  icons: Readonly<Record<ColourSchemePreference, React.ReactNode>>
}) {
  const [state, action] = useActionState(setSchemeAction, EMPTY)
  const current = state.scheme ?? scheme

  return (
    <form action={action}>
      <ProgressiveMarker />
      <span
        role="group"
        aria-label={groupLabel}
        className="inline-flex items-center overflow-hidden rounded-md border border-border text-muted-foreground"
      >
        {COLOUR_SCHEMES.map((option) => {
          const selected = current === option
          return (
            <PendingButton
              key={option}
              name="scheme"
              value={option}
              title={labels[option]}
              aria-pressed={selected}
              onClick={() => applySchemeImmediately(option)}
              className={`inline-flex h-8 items-center justify-center border-border px-2.5 transition-colors [&:not(:first-child)]:border-l focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {icons[option]}
              <span className="sr-only">{labels[option]}</span>
            </PendingButton>
          )
        })}
      </span>
    </form>
  )
}
