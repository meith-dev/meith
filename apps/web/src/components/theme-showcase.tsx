"use client"

import { useState } from "react"

import { themes } from "../content/site"
import { Screenshot } from "./screenshot"

/*
 * The five themes, in light and dark, on one board.
 *
 * Both schemes are shown side by side rather than swapped to match the
 * reader's, because the claim being made is about the *theme* — and a theme
 * here is two sets of tokens, not one. A reader on a light page who is shown
 * only Midnight's light variant has not seen Midnight.
 *
 * Only the selected theme's pair is in the DOM. Ten screenshots at two device
 * pixels to the CSS pixel is five megabytes, and a switcher that fetches all
 * of it to show a fifth of it would undo the point of showing anything.
 *
 * The tabs follow the WAI-ARIA pattern rather than approximating it: roving
 * focus stays on the selected tab, and the arrow keys move between them, which
 * is what a reader who is not using a mouse expects of something that looks
 * like this.
 */
export function ThemeShowcase() {
  const [active, setActive] = useState(0)
  const theme = themes.list[active] ?? themes.list[0]!

  function move(by: number) {
    setActive((current) => (current + by + themes.list.length) % themes.list.length)
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        aria-label="Themes"
        className="flex flex-wrap gap-1.5"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault()
            move(1)
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault()
            move(-1)
          }
        }}
        role="tablist"
      >
        {themes.list.map((entry, index) => (
          <button
            aria-controls="theme-panel"
            aria-selected={index === active}
            className={index === active ? "tab tab-on" : "tab"}
            id={`theme-tab-${entry.key}`}
            key={entry.key}
            onClick={() => setActive(index)}
            role="tab"
            tabIndex={index === active ? 0 : -1}
            type="button"
          >
            {entry.title}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`theme-tab-${theme.key}`}
        className="flex flex-col gap-4"
        id="theme-panel"
        role="tabpanel"
      >
        <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{theme.blurb}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {themes.schemes.map((scheme) => (
            <figure className="flex flex-col gap-2" key={scheme.key}>
              <Screenshot shot={scheme.key === "light" ? theme.light : theme.dark} />
              <figcaption className="eyebrow">{scheme.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}
