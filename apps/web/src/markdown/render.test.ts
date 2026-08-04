import { describe, expect, it } from "vitest"

import { renderMarkdown } from "./render"
import { createSlugger, slugify } from "./slug"

/** Links are the docs layer's business; these tests only need them to be visible. */
const identity = { resolveLink: (href: string) => ({ href, external: false }) }

describe("slugify", () => {
  it("matches the ids GitHub generates", () => {
    /*
     * These four are not invented: they are anchors that `docs/operating.md` and
     * `docs/theme-slots.md` actually link to. If this function stops agreeing
     * with GitHub, those links break here while continuing to work in the
     * repository — the failure this whole module exists to avoid.
     */
    expect(slugify("Connection pooling")).toBe("connection-pooling")
    expect(slugify("Backup and restore")).toBe("backup-and-restore")
    expect(slugify("Shell")).toBe("shell")
    expect(slugify("If it fails halfway")).toBe("if-it-fails-halfway")
  })

  it("drops punctuation and keeps letters that carry accents", () => {
    expect(slugify("What's the p95?")).toBe("whats-the-p95")
    expect(slugify("Ar scáth a chéile")).toBe("ar-scáth-a-chéile")
  })

  it("numbers repeats in document order", () => {
    const slug = createSlugger()
    expect(slug("Notes")).toBe("notes")
    expect(slug("Notes")).toBe("notes-1")
    expect(slug("Notes")).toBe("notes-2")
  })
})

describe("renderMarkdown", () => {
  it("lifts the title out of the body", () => {
    const { title, html } = renderMarkdown("# Running a board\n\nText.\n", identity)

    expect(title).toBe("Running a board")
    expect(html).not.toContain("<h1")
    expect(html).toContain("Text.")
  })

  it("gives every heading an id the contents rail agrees with", () => {
    const { html, headings } = renderMarkdown(
      "# T\n\n## Connection pooling\n\nBody.\n\n### Notes\n\nMore.\n",
      identity,
    )

    expect(headings).toEqual([
      { id: "connection-pooling", text: "Connection pooling", depth: 2 },
      { id: "notes", text: "Notes", depth: 3 },
    ])
    expect(html).toContain('id="connection-pooling"')
    expect(html).toContain('href="#notes"')
  })

  it("indexes deeper headings but keeps them out of the rail", () => {
    const { headings, sections } = renderMarkdown("# T\n\n## Two\n\na\n\n#### Four\n\nb\n", identity)

    expect(headings.map((heading) => heading.depth)).toEqual([2])
    expect(sections.map((section) => section.heading)).toEqual(["Two", "Four"])
  })

  it("escapes raw HTML instead of emitting it", () => {
    /*
     * `docs/mybb-parity.md` line 494 says a moved thread leaves a `Moved: <title>`
     * row. Passed through, that is an empty element and the reader sees nothing;
     * escaped, they see what the author wrote. The same rule is what makes it
     * impossible for an edit to a document to inject markup into a page.
     */
    const { html } = renderMarkdown('# T\n\nMoved: <title>\n\n<img src="x" onerror="go()">\n', identity)

    expect(html).toContain("&lt;title&gt;")
    expect(html).not.toContain("<title>")
    /* The attribute survives as text — what matters is that no element carries it. */
    expect(html).not.toContain("<img")
    expect(html).toContain("onerror=&quot;go()&quot;")
  })

  it("drops the generated-file comment", () => {
    const { html } = renderMarkdown(
      "# Performance\n\n<!--\n  GENERATED FILE — do not edit.\n-->\n\nBudgets.\n",
      identity,
    )

    expect(html).not.toContain("GENERATED FILE")
    expect(html).toContain("Budgets.")
  })

  it("wraps tables so the page does not scroll sideways", () => {
    const { html } = renderMarkdown("# T\n\n| A | B |\n|---|---|\n| 1 | 2 |\n", identity)

    expect(html).toContain('<div class="doc-table"')
    expect(html).toContain("<table>")
  })

  it("labels a fenced block with its language", () => {
    const { html } = renderMarkdown("# T\n\n```sh\nnpm run dev\n```\n", identity)

    expect(html).toContain("shell")
    expect(html).toContain("<code>npm run dev")
  })

  it("hands every link to the resolver", () => {
    const seen: string[] = []
    const { html } = renderMarkdown("# T\n\n[a](./operating.md#permissions) [b](https://x.test)\n", {
      resolveLink: (href) => {
        seen.push(href)
        return { href: `/resolved${href}`, external: href.startsWith("http") }
      },
    })

    expect(seen).toEqual(["./operating.md#permissions", "https://x.test"])
    expect(html).toContain('href="/resolved./operating.md#permissions"')
    expect(html).toContain('rel="noreferrer"')
  })

  it("cuts the document at its headings for the search index", () => {
    const { sections } = renderMarkdown(
      "# T\n\nPreamble.\n\n## One\n\nFirst body.\n\n## Two\n\nSecond body.\n",
      identity,
    )

    expect(sections).toEqual([
      { id: "", heading: "T", depth: 1, text: "Preamble." },
      { id: "one", heading: "One", depth: 2, text: "First body." },
      { id: "two", heading: "Two", depth: 2, text: "Second body." },
    ])
  })

  it("keeps fenced code out of the indexed text", () => {
    const { sections } = renderMarkdown("# T\n\n## One\n\nProse.\n\n```sh\nsecret-command\n```\n", identity)

    /* No preamble section: a document that opens straight onto a heading has none. */
    expect(sections).toHaveLength(1)
    expect(sections[0]?.text).toBe("Prose.")
  })
})
