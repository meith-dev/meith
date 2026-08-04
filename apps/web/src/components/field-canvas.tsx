"use client"

/**
 * The hero: a townland from above.
 *
 * Small irregular fields divided by walls, filling in one after another the way
 * a meitheal works its way across one. A jittered quad lattice rather than a
 * true Voronoi — the boundaries want to look walked, not computed.
 *
 * Ported from the static site this app replaces, with two changes. It now reads
 * its colours from the design tokens on every paint (so the theme toggle is
 * reflected without a reload), and it observes `data-theme` as well as the
 * system preference, because the toggle sets the former.
 */

import { useEffect, useRef } from "react"

/** Deterministic jitter, so a resize redraws the same townland. */
function noise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

interface Cell {
  quad: [number, number][]
  /** How far this field is from where the first hands landed. */
  dist: number
  gorse: boolean
  shade: number
}

export function FieldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const reduced = matchMedia("(prefers-reduced-motion: reduce)")
    const scheme = matchMedia("(prefers-color-scheme: dark)")
    let cells: Cell[] = []
    let start = 0
    let raf = 0

    const token = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim()

    function build(width: number, height: number) {
      const target = width < 700 ? 108 : 132 // field width, CSS px
      const columns = Math.max(3, Math.round(width / target)) + 1
      const rows = Math.max(3, Math.round(height / target)) + 1
      const cellWidth = width / (columns - 1)
      const cellHeight = height / (rows - 1)
      const jitterX = cellWidth * 0.32
      const jitterY = cellHeight * 0.32

      const point = (column: number, row: number): [number, number] => [
        (column - 0.5) * cellWidth + (noise(column, row) - 0.5) * jitterX * 2,
        (row - 0.5) * cellHeight + (noise(column + 99, row + 7) - 0.5) * jitterY * 2,
      ]

      cells = []
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const quad: [number, number][] = [
            point(column, row),
            point(column + 1, row),
            point(column + 1, row + 1),
            point(column, row + 1),
          ]
          const centreX = quad.reduce((sum, p) => sum + p[0], 0) / 4
          const centreY = quad.reduce((sum, p) => sum + p[1], 0) / 4

          cells.push({
            quad,
            dist:
              Math.hypot(centreX - width * 0.14, centreY - height * 0.42) /
              Math.hypot(width, height),
            gorse: noise(column * 3 + 5, row * 3 + 11) > 0.93,
            shade: noise(column + 41, row + 17),
          })
        }
      }
    }

    function paint(progress: number) {
      if (!canvas || !context) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const fieldA = token("--field-a")
      const fieldB = token("--field-b")
      const wall = token("--wall")
      const gorse = token("--gorse-flat")

      context.clearRect(0, 0, width, height)
      context.lineJoin = "round"
      context.lineWidth = 1

      for (const cell of cells) {
        // Each field has its own moment: it is cut, or it is not yet.
        const t = Math.min(1, Math.max(0, (progress - cell.dist * 0.85) * 3.2))
        if (t <= 0) continue

        const [first, ...rest] = cell.quad
        if (!first) continue

        context.beginPath()
        context.moveTo(first[0], first[1])
        for (const [x, y] of rest) context.lineTo(x, y)
        context.closePath()

        context.globalAlpha = t * (cell.gorse ? 0.5 : 0.85)
        context.fillStyle = cell.gorse ? gorse : cell.shade > 0.5 ? fieldA : fieldB
        context.fill()

        context.globalAlpha = t * 0.65
        context.strokeStyle = wall
        context.stroke()
      }
      context.globalAlpha = 1
    }

    function frame(now: number) {
      if (!start) start = now
      const progress = Math.min(1.35, (now - start) / 1500)
      paint(progress)
      if (progress < 1.35) raf = requestAnimationFrame(frame)
    }

    function resize() {
      if (!canvas || !context) return
      const dpr = Math.min(2, devicePixelRatio || 1)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) return
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      build(width, height)
      paint(1.35)
    }

    const repaint = () => paint(1.35)

    resize()
    if (!reduced.matches) {
      start = 0
      raf = requestAnimationFrame(frame)
    }

    /* Both, because the toggle writes `data-theme` and the OS writes neither. */
    const observer = new MutationObserver(repaint)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    scheme.addEventListener("change", repaint)
    addEventListener("resize", resize, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      scheme.removeEventListener("change", repaint)
      removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className="absolute inset-0 -z-10 h-full w-full" />
}
