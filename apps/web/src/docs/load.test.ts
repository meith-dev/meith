import { describe, expect, it } from "vitest"

import { site } from "../content/site"
import { linkResolver, loadAllDocuments } from "./load"
import { documents, internalDocuments, readingOrder } from "./registry"

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
    expect(fromNested("../operating.md")).toEqual({ href: "/docs/operating", external: false })
    expect(fromNested("./sibling.md")).toEqual({
      href: `${site.repository}/blob/main/docs/notes/sibling.md`,
      external: true,
    })
  })

  it("sends the documentation index to this site's own index", () => {
    expect(fromDocs("./README.md")).toEqual({ href: "/docs", external: false })
  })

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
    expect(fromDocs("./internal-notes.md")).toEqual({
      href: `${site.repository}/blob/main/docs/internal-notes.md`,
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

  it("never publishes a document marked internal", () => {
    const hiddenFiles = new Set(internalDocuments.map((doc) => doc.file))
    for (const document of documents) {
      expect(hiddenFiles.has(document.file)).toBe(false)
    }
  })
})
