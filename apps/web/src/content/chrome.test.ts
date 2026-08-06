import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { chromeColour } from "./chrome"

/**
 * `<meta name="theme-color">` cannot reference a design token — the browser
 * paints with it before a stylesheet exists — so its two values are written out
 * by hand in `chrome.ts`. This is the check that keeps that copy honest.
 *
 * The failure it prevents is quiet and slightly ugly rather than dramatic: the
 * palette is adjusted in `globals.css`, the meta tag is not, and from then on
 * the browser's toolbar is a slightly different grey from the page under it —
 * on mobile Safari and Chrome, which is where most people see the site.
 */
const stylesheet = join(dirname(fileURLToPath(import.meta.url)), "../styles/globals.css")

/** The value of a custom property inside a given selector's block. */
function tokenIn(css: string, selector: string, property: string): string | undefined {
  const escaped = selector.replace(/[[\]^$.*+?()|{}\\]/g, "\\$&")
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1]
  if (body === undefined) return undefined
  return new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim()
}

describe("theme-color", () => {
  it("matches --canvas in both schemes", async () => {
    const css = await readFile(stylesheet, "utf8")

    /*
     * `:root {` matches the light block at the top of the file rather than the
     * one nested in the dark media query, because the selector must be followed
     * immediately by its brace — `:root[data-theme=…]` is a different string.
     */
    expect(tokenIn(css, ":root", "--canvas")).toBe(chromeColour.light.toLowerCase())
    expect(tokenIn(css, ':root[data-theme="dark"]', "--canvas")).toBe(
      chromeColour.dark.toLowerCase(),
    )
  })
})
