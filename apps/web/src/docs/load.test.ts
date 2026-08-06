import { describe, expect, it } from "vitest"

import { site } from "../content/site"
import { linkResolver, loadAllDocuments } from "./load"
import { documents, internalDocuments, readingOrder } from "./registry"

/**
 * The documents cross-reference each other with repository-relative paths,
 * because they are read on GitHub as well as here. Turning those into working
 * links is the one piece of translation this site does to the text it renders,
 * and it has three cases — two of which are easy to get subtly wrong and neither
 * of which shows up as an error.
 */
describe("linkResolver", () => {
  const fromDocs = linkResolver("operating.md")
  const fromNested = linkResolver("notes/example.md")

  it("keeps an anchor within the page", () => {
    expect(fromDocs("#connection-pooling")).toEqual({
      href: "#connection-pooling",
      external: false,
    })
  })

  it("sends a published document to its page, anchor and all", () => {
    expect(fromDocs("./theme-api.md")).toEqual({ href: "/docs/theme-api", external: false })
    expect(fromDocs("./plugin-api.md#failure")).toEqual({
      href: "/docs/plugin-api#failure",
      external: false,
    })
  })

  it("resolves relative to the document doing the linking", () => {
    /*
     * A nested document. `docs/` has none today — the ADRs that used to live in
     * `adr/` are gone — but the resolver has to keep working for one, because the
     * failure is silent: a link from a subdirectory would resolve against the
     * root and quietly point at a document that is not the one meant.
     */
    expect(fromNested("../operating.md")).toEqual({ href: "/docs/operating", external: false })
    expect(fromNested("./sibling.md")).toEqual({
      href: `${site.repository}/blob/main/docs/notes/sibling.md`,
      external: true,
    })
  })

  it("sends the documentation index to this site's own index", () => {
    expect(fromDocs("./README.md")).toEqual({ href: "/docs", external: false })
  })

  /*
   * The self-hosting guide links to the files an operator is about to run —
   * `docker-compose.yml`, the Dockerfile, `.env.example` — and those sit at the
   * repository root, outside `docs/`. Before this they resolved to
   * `…/tree/main/docs/../docker-compose.yml`, which renders as a link and 404s
   * when followed.
   */
  it("sends a link that climbs out of docs/ to the repository root", () => {
    expect(fromDocs("../docker-compose.yml")).toEqual({
      href: `${site.repository}/blob/main/docker-compose.yml`,
      external: true,
    })
    expect(fromDocs("../.env.example")).toEqual({
      href: `${site.repository}/blob/main/.env.example`,
      external: true,
    })
  })

  it("sends an unpublished document to the repository rather than to a 404", () => {
    /*
     * The roadmap and the progress log are deliberately not on this site. A link
     * to one still has to *work*, and the honest destination is the file itself.
     */
    expect(fromDocs("./roadmap.md")).toEqual({
      href: `${site.repository}/blob/main/docs/roadmap.md`,
      external: true,
    })
    expect(fromDocs("./notes")).toEqual({
      href: `${site.repository}/tree/main/docs/notes`,
      external: true,
    })
  })

  it("leaves an absolute URL alone and marks it external", () => {
    expect(fromDocs("https://vercel.com")).toEqual({
      href: "https://vercel.com",
      external: true,
    })
    expect(fromDocs("mailto:hello@meith.dev")).toEqual({
      href: "mailto:hello@meith.dev",
      external: true,
    })
  })
})

describe("the published set", () => {
  it("renders every document in the manifest", async () => {
    const loaded = await loadAllDocuments()

    expect(loaded).toHaveLength(documents.length)
    for (const document of loaded) {
      expect(document.rendered.html.length).toBeGreaterThan(0)
      expect(document.rendered.title).not.toBeNull()
    }
  })

  it("puts every document in the reading order exactly once", () => {
    expect(readingOrder).toHaveLength(documents.length)
    expect(new Set(readingOrder.map((doc) => doc.slug)).size).toBe(documents.length)
  })

  it("keeps the progress records off the site", () => {
    /*
     * Named rather than counted. These four are the working records the site
     * deliberately does not publish, and the check that matters is that they are
     * still absent — a manifest edit that moved one into `documents` would
     * otherwise be caught by nothing.
     */
    const hidden = internalDocuments.map((doc) => doc.file)
    for (const file of ["roadmap.md", "plan-status.md", "progress.md", "deviations.md"]) {
      expect(hidden).toContain(file)
      expect(documents.map((doc) => doc.file)).not.toContain(file)
    }
  })
})
