"use client"

/**
 * Draws the mermaid figures the renderer left in the page.
 *
 * The renderer emits a `doc-diagram` figure whose content is the diagram's
 * source (see `src/markdown/render.ts`): that is what GitHub renders natively,
 * what `/llms.txt` serves, and what a reader without JavaScript sees. This
 * component is the enhancement on top — after mount it finds those figures,
 * loads mermaid, and swaps the source for the drawn SVG.
 *
 * Two decisions worth stating:
 *
 * - **Mermaid is imported dynamically, and only when a figure exists.** The
 *   library is by far the largest thing this site could ship, and most pages
 *   have no diagram. A page without one pays for this component's few lines
 *   and nothing else.
 * - **Rendering follows the page's colour scheme, live.** The scheme is the
 *   `data-theme` attribute when the reader has chosen one and the system
 *   preference otherwise — the same resolution as the stylesheet's. Mermaid
 *   bakes its colours into the SVG at render time, so unlike Shiki's dual
 *   custom properties there is nothing for CSS to switch; the diagrams are
 *   re-rendered when either input changes.
 *
 * A diagram that fails to render keeps its source visible. Wrong markup in a
 * document is an authoring bug, and the source is the most debuggable thing
 * the page could show.
 */

import { useEffect } from "react"

type Scheme = "light" | "dark"

/** The stylesheet's resolution, repeated: explicit choice first, system second. */
function currentScheme(): Scheme {
  const chosen = document.documentElement.getAttribute("data-theme")
  if (chosen === "light" || chosen === "dark") return chosen
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function MermaidDiagrams() {
  useEffect(() => {
    const figures = Array.from(
      document.querySelectorAll('.doc-body .doc-diagram[data-diagram="mermaid"]'),
    )
    if (figures.length === 0) return

    let disposed = false
    let sequence = 0

    const draw = async () => {
      const { default: mermaid } = await import("mermaid")
      if (disposed) return

      const scheme = currentScheme()
      mermaid.initialize({
        startOnLoad: false,
        /* The documents are this repository's own, but strict costs nothing. */
        securityLevel: "strict",
        theme: scheme === "dark" ? "dark" : "neutral",
        fontFamily: "inherit",
      })

      for (const figure of figures) {
        const source = figure.querySelector("pre")?.getAttribute("data-code")
        if (!source) continue

        try {
          /* Fresh ids per pass: mermaid uses them for internal SVG references. */
          const { svg } = await mermaid.render(`doc-diagram-${++sequence}`, source)
          if (disposed) return

          let canvas = figure.querySelector(".doc-diagram-canvas")
          if (!canvas) {
            canvas = document.createElement("div")
            canvas.className = "doc-diagram-canvas"
            figure.append(canvas)
          }
          canvas.innerHTML = svg
          figure.setAttribute("data-rendered", "true")
        } catch {
          /* Leave the source standing — see the header. */
        }
      }
    }

    void draw()

    /* Re-draw when either input to the scheme changes. */
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onMediaChange = () => void draw()
    media.addEventListener("change", onMediaChange)

    const observer = new MutationObserver(() => void draw())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

    return () => {
      disposed = true
      media.removeEventListener("change", onMediaChange)
      observer.disconnect()
    }
  }, [])

  return null
}
