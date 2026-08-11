"use client"

import { useState } from "react"

import { audiences, picker } from "../content/site"
import { BoardPreview } from "./board-preview"

/*
 * The one piece of state on the marketing site, and the only script the
 * landing page ships.
 *
 * What it buys is recognition. The page above it argues that every kind of
 * community loses the same things, which is an argument a reader has to be
 * persuaded of; this shows them their own board instead, with their own
 * forums in it and a plausible last post at the bottom, and asks them to be
 * persuaded of nothing at all.
 *
 * The first audience renders on the server, so the band is complete and
 * legible before hydration and without JavaScript at all — the picker adds the
 * other four rather than being the only way to see any of them.
 */
export function AudiencePicker() {
  const [selected, setSelected] = useState(audiences[0].id)
  const audience = audiences.find((entry) => entry.id === selected) ?? audiences[0]

  return (
    <figure className="flex flex-col gap-4">
      <BoardPreview audience={audience} />

      <div className="flex flex-col gap-2.5">
        <p className="eyebrow" id="picker-prompt">
          {picker.prompt}
        </p>

        <div aria-labelledby="picker-prompt" className="flex flex-wrap gap-1.5" role="group">
          {audiences.map((entry) => (
            <button
              key={entry.id}
              aria-pressed={entry.id === audience.id}
              className="pick"
              onClick={() => setSelected(entry.id)}
              type="button"
            >
              {entry.chip}
            </button>
          ))}
        </div>
      </div>

      <figcaption aria-live="polite" className="flex flex-col gap-1.5">
        <p className="text-base leading-[1.4] font-medium tracking-[-0.015em] text-fg text-pretty">
          {audience.line}
        </p>
        <p className="text-micro leading-[1.6] text-fg-muted text-pretty">{audience.body}</p>
      </figcaption>
    </figure>
  )
}
