/**
 * Reading `docs/` from the workspace root, at build time.
 *
 * This is the join between the site and the single copy of the documentation.
 * Nothing here writes, copies or caches a document to disk: `docs/*.md` is read
 * where it lives, rendered, and prerendered into static pages. Editing a
 * document is editing that file, and there is no second copy to forget.
 *
 * **Build time, not request time.** Every page that calls into this module is
 * statically rendered, so these reads happen once during `next build` and never
 * on a request. That matters for deployment: the standalone server does not
 * carry `docs/` and does not need to.
 *
 * Note the absence of a directory scan. The set of documents comes from the
 * manifest (see `registry.ts`), never from a `readdir` — the same rule the rest
 * of this workspace follows for themes and plugins, and for the same reason: a
 * set discovered at runtime is unknowable at build time, and a document that
 * fails to render should fail the build rather than 404 in production.
 */

import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, normalize, resolve } from "node:path"
import { cache } from "react"

import { renderMarkdown, type RenderedMarkdown, type ResolvedLink } from "../markdown/render"
import { site } from "../content/site"
import {
  documents,
  findDocument,
  findDocumentByFile,
  isInternalFile,
  type DocEntry,
} from "./registry"

/**
 * The workspace root, found by walking up for the file that defines it.
 *
 * Not `../../` from this module: this file is bundled, and the bundle's location
 * is not a stable distance from the root. Not `process.cwd()` on its own either
 * — that is `apps/web` under `pnpm dev` and could be the repository root under a
 * task runner. Walking up for `pnpm-workspace.yaml` is right in both cases and
 * fails loudly rather than reading nothing.
 */
function workspaceRoot(): string {
  let directory = resolve(process.cwd())

  for (;;) {
    if (existsSync(join(directory, "pnpm-workspace.yaml"))) return directory
    const parent = dirname(directory)
    if (parent === directory) {
      throw new Error(
        "Could not find the workspace root above " +
          `${process.cwd()}. The documentation is read from docs/ there; the site ` +
          "cannot be built from outside the repository.",
      )
    }
    directory = parent
  }
}

const DOCS_DIRECTORY = join(workspaceRoot(), "docs")

/** A document's canonical URL in the repository, for links the site does not host. */
function repositoryHref(pathFromRoot: string, anchor: string): string {
  return `${site.repository}/blob/main/${pathFromRoot}${anchor}`
}

/**
 * Where a link inside a document should point.
 *
 * The documents cross-reference each other constantly, and they do it with
 * repository-relative paths because they are also read on GitHub. Three cases,
 * and the third is the one worth stating: a link to a document the site does not
 * publish — the roadmap, the progress log — still has to *work*, so it goes to
 * the file in the repository rather than to a 404 or, worse, a dead `#`.
 */
export function linkResolver(file: string): (href: string) => ResolvedLink {
  const directory = dirname(file)

  return (href: string): ResolvedLink => {
    if (href.startsWith("#")) return { href, external: false }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
      return { href, external: true }
    }

    const [rawPath = "", rawAnchor] = href.split("#")
    const anchor = rawAnchor === undefined ? "" : `#${rawAnchor}`
    /* `normalize` collapses the `./` and any `../`; `docs/` is the root here. */
    const target = normalize(directory === "." ? rawPath : join(directory, rawPath))

    /* The index of the documentation is this site's own /docs page. */
    if (target === "README.md") return { href: `/docs${anchor}`, external: false }

    const published = findDocumentByFile(target)
    if (published) return { href: `/docs/${published.slug}${anchor}`, external: false }

    if (isInternalFile(target) || target.endsWith(".md")) {
      return { href: repositoryHref(`docs/${target}`, anchor), external: true }
    }

    /* A directory (`./adr`) or anything else: the repository is the honest answer. */
    return { href: `${site.repository}/tree/main/docs/${target}${anchor}`, external: true }
  }
}

export interface LoadedDocument {
  readonly entry: DocEntry
  readonly rendered: RenderedMarkdown
  /** Path relative to the repository root, for the "edit this page" link. */
  readonly sourcePath: string
}

/**
 * `cache()` rather than a module-level map: it is scoped to one render pass,
 * which is what a build needs, and it does not hold every document in memory for
 * the life of a long-running dev server.
 */
export const loadDocument = cache(async (slug: string): Promise<LoadedDocument | null> => {
  const entry = findDocument(slug)
  if (!entry) return null

  const absolute = join(DOCS_DIRECTORY, entry.file)
  const markdown = await readFile(absolute, "utf8")

  return {
    entry,
    rendered: renderMarkdown(markdown, { resolveLink: linkResolver(entry.file) }),
    sourcePath: `docs/${entry.file}`,
  }
})

/** Every published document, in reading order. Used by the search index and /llms.txt. */
export const loadAllDocuments = cache(async (): Promise<readonly LoadedDocument[]> => {
  const loaded = await Promise.all(documents.map((doc) => loadDocument(doc.slug)))
  return loaded.filter((doc): doc is LoadedDocument => doc !== null)
})

/** The raw Markdown, unrendered. `/llms.txt` serves this rather than stripped HTML. */
export const readDocumentSource = cache(async (slug: string): Promise<string | null> => {
  const entry = findDocument(slug)
  if (!entry) return null
  return readFile(join(DOCS_DIRECTORY, entry.file), "utf8")
})
