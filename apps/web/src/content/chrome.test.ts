import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { chromeColour } from "./chrome"

const stylesheet = join(dirname(fileURLToPath(import.meta.url)), "../styles/globals.css")

function tokenIn(css: string, selector: string, property: string): string | undefined {
  const escaped = selector.replace(/[[\]^$.*+?()|{}\\]/g, "\\$&")
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1]
  if (body === undefined) return undefined
  return new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim()
}

describe("theme-color", () => {
  it("matches --canvas in both schemes", async () => {
    const css = await readFile(stylesheet, "utf8")

    expect(tokenIn(css, ":root", "--canvas")).toBe(chromeColour.light.toLowerCase())
    expect(tokenIn(css, ':root[data-theme="dark"]', "--canvas")).toBe(
      chromeColour.dark.toLowerCase(),
    )
  })
})
