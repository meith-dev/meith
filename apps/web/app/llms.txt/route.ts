import { site } from "../../src/content/site"
import { readDocumentSource } from "../../src/docs/load"
import { documents, findSection, readingOrder, sections } from "../../src/docs/registry"

/**
 * The whole documentation set as one plain-text file.
 *
 * Cheap to provide and genuinely useful twice over: a language model asked about
 * Meith can be handed this instead of crawling fourteen pages of HTML, and a
 * person can grep it. It serves the *Markdown*, not the rendered text — the
 * tables and fenced blocks survive, and the links stay readable.
 *
 * Same single source as everything else: these bytes are `docs/*.md`.
 */
export const dynamic = "force-static"

export async function GET() {
  const parts: string[] = [
    `# ${site.name}`,
    "",
    `> ${site.tagline}`,
    "",
    site.description,
    "",
    `Source: ${site.repository}`,
    `Documentation: ${site.url}/docs`,
    "",
    "This file is the published documentation, concatenated. Each document below",
    "is the exact contents of a file under `docs/` in the repository above, which",
    "is the single editable copy — the website renders these same files.",
    "",
    "## Contents",
    "",
  ]

  for (const section of sections) {
    parts.push(`### ${section.title}`, "")
    for (const doc of documents.filter((entry) => entry.section === section.id)) {
      parts.push(`- [${doc.title}](${site.url}/docs/${doc.slug}) — ${doc.blurb}`)
    }
    parts.push("")
  }

  for (const entry of readingOrder) {
    const markdown = await readDocumentSource(entry.slug)
    if (markdown === null) continue

    parts.push(
      "",
      "---",
      "",
      `<!-- docs/${entry.file} · ${findSection(entry.section)?.title ?? entry.section} -->`,
      "",
      markdown.trimEnd(),
      "",
    )
  }

  return new Response(parts.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400",
    },
  })
}
