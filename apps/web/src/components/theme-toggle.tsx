"use client"

/**
 * Light, dark, or whatever the system says.
 *
 * Three states rather than two. A two-state toggle has to pick a starting side,
 * and whichever it picks is wrong for half of the people arriving — and once
 * they have touched it, there is no way back to "follow my system", which is
 * what most people actually want.
 *
 * The choice is written to `data-theme` on `<html>` (the stylesheet's palette
 * blocks key off it) and to `localStorage`, which the bootstrap script in the
 * root layout reads before first paint. `system` removes the attribute rather
 * than writing a value, so the media query takes over again.
 */

import { useEffect, useState } from "react"

import { THEME_STORAGE_KEY } from "../theme-storage"

type Choice = "light" | "dark" | "system"

const CHOICES: readonly { value: Choice; label: string; glyph: string }[] = [
  { value: "light", label: "Light", glyph: "☀" },
  { value: "system", label: "System", glyph: "◐" },
  { value: "dark", label: "Dark", glyph: "☾" },
]

function apply(choice: Choice) {
  const root = document.documentElement
  if (choice === "system") {
    root.removeAttribute("data-theme")
    localStorage.removeItem(THEME_STORAGE_KEY)
  } else {
    root.setAttribute("data-theme", choice)
    localStorage.setItem(THEME_STORAGE_KEY, choice)
  }
}

export function ThemeToggle() {
  /*
   * `system` on the server and on the first client render, then corrected in an
   * effect. Reading localStorage during render would make the markup depend on a
   * value the server cannot know, and React would replace the whole control on
   * hydration. The *page* is already correct by then — the bootstrap script set
   * the attribute before paint — so only this control's highlight moves.
   */
  const [choice, setChoice] = useState<Choice>("system")

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === "light" || stored === "dark") setChoice(stored)
  }, [])

  return (
    <fieldset
      className="flex items-center gap-0 rounded-sm border border-wall"
      aria-label="Colour scheme"
    >
      {CHOICES.map((option) => {
        const active = option.value === choice
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.label}
            onClick={() => {
              setChoice(option.value)
              apply(option.value)
            }}
            className={`px-2 py-1 font-mono text-micro leading-none transition-colors ${
              active ? "bg-ground-deep text-gorse" : "text-ink-faint hover:text-ink"
            }`}
          >
            <span aria-hidden>{option.glyph}</span>
            <span className="sr-only">{option.label}</span>
          </button>
        )
      })}
    </fieldset>
  )
}
