/**
 * Navigation model for the documentation site. Two top-level sections:
 * "Using meith" (end-user docs) and "Developers" (built from the repo's
 * docs/ files). Order here drives the sidebar and prev/next links.
 */
export type DocLink = {
  title: string
  href: string
}

export type DocSection = {
  title: string
  items: DocLink[]
}

export const docsNav: DocSection[] = [
  {
    title: "Using meith",
    items: [
      { title: "Introduction", href: "/docs" },
      { title: "Getting started", href: "/docs/getting-started" },
      { title: "Using meith", href: "/docs/using-meith" },
      { title: "Workspaces & tabs", href: "/docs/spaces" },
      { title: "Working with agents", href: "/docs/agents" },
      { title: "Tools & permissions", href: "/docs/tools" },
      { title: "Plugins", href: "/docs/plugins" },
      { title: "The meith CLI", href: "/docs/cli" },
    ],
  },
  {
    title: "Developers",
    items: [
      { title: "Overview", href: "/docs/developers" },
      { title: "Architecture", href: "/docs/developers/architecture" },
      { title: "Tool protocol", href: "/docs/developers/tool-protocol" },
      { title: "Adding tools", href: "/docs/developers/adding-tools" },
      { title: "Agent runtime", href: "/docs/developers/agent-runtime" },
      { title: "Plugin API", href: "/docs/developers/plugin-api" },
    ],
  },
]

/** Flattened, ordered list of every doc page — used for prev/next paging. */
export const docsFlat: DocLink[] = docsNav.flatMap((section) => section.items)

export function getAdjacentDocs(pathname: string) {
  const index = docsFlat.findIndex((d) => d.href === pathname)
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? docsFlat[index - 1] : null,
    next: index < docsFlat.length - 1 ? docsFlat[index + 1] : null,
  }
}
