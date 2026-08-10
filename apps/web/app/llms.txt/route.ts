import { licence, site } from "../../src/content/site"
import { readDocumentSource } from "../../src/docs/load"
import { documents, findSection, readingOrder, sections } from "../../src/docs/registry"

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
    `Licence: ${licence.spdx} — ${licence.name}, in ${licence.file} in the repository ` +
      `above. It incorporates the GNU GPL v3, which is in ${licence.incorporates}.`,
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
