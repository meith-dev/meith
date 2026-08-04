import type { Metadata } from "next"
import Link from "next/link"

import { site } from "../../src/content/site"
import {
  docHref,
  documentsInSection,
  internalDocuments,
  sections,
} from "../../src/docs/registry"

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Every document Meith publishes, organised by what you are trying to do: run a board, " +
    "write a theme or a plugin, call the API, or move a community off MyBB.",
  alternates: { canonical: "/docs" },
}

/**
 * The index.
 *
 * Organised by what the reader is trying to do rather than by filename, for the
 * reason `docs/README.md` gives: a documentation index whose entry point is a
 * directory listing makes every reader guess, and most of them guess wrong.
 */
export default function DocsIndexPage() {
  return (
    <div className="max-w-[46rem]">
      <p className="eyebrow">Documentation</p>
      <h1 className="display mt-2 text-huge leading-[1.02]">
        Each document has one audience and one job.
      </h1>
      <p className="mt-5 text-mid leading-[1.45] text-ink-soft text-pretty">
        Four of these are generated from the code they describe, and{" "}
        <code className="font-mono text-[0.9em]">pnpm verify</code> fails when one of them is
        stale. A reference read by somebody who cannot see the source is worse than no reference
        when it is wrong.
      </p>

      <div className="mt-14 flex flex-col gap-14">
        {sections.map((section) => (
          <section key={section.id} id={section.id}>
            <h2 className="font-display text-large font-semibold tracking-[-0.015em] text-ink">
              {section.title}
            </h2>
            <p className="mt-1 text-micro text-ink-faint">{section.blurb}</p>

            <ul className="mt-5 flex flex-col border-t border-wall">
              {documentsInSection(section.id).map((doc) => (
                <li key={doc.slug} className="border-b border-wall">
                  <Link href={docHref(doc.slug)} className="group flex flex-col gap-1 py-4">
                    <span className="flex flex-wrap items-baseline gap-3">
                      <span className="text-mid text-ink transition-colors group-hover:text-gorse">
                        {doc.title}
                      </span>
                      {doc.generated ? (
                        <span className="border border-wall px-1.5 py-0.5 font-mono text-[0.7rem] tracking-[0.1em] text-ink-faint uppercase">
                          generated
                        </span>
                      ) : null}
                    </span>
                    <span className="text-micro text-pretty text-ink-soft">{doc.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/*
        Naming what is *not* here, and where it is. A reader who has seen the
        repository knows the roadmap and the progress log exist; leaving them
        unmentioned reads as an omission rather than a decision.
      */}
      <section className="mt-16 rounded-sm border border-wall bg-ground-deep p-6">
        <h2 className="font-display text-mid font-semibold text-ink">Kept in the repository</h2>
        <p className="mt-1 text-micro text-ink-soft">
          These are working records rather than documentation, and they are only meaningful beside
          the plan they are written against.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {internalDocuments.map((doc) => (
            <li key={doc.file} className="text-micro text-ink-soft">
              <a
                className="textlink font-mono"
                href={`${site.repository}/blob/main/docs/${doc.file}`}
              >
                docs/{doc.file}
              </a>{" "}
              — {doc.reason}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-micro text-ink-faint">
        Every page here is rendered from the Markdown in{" "}
        <a className="textlink font-mono" href={`${site.repository}/tree/main/docs`}>
          docs/
        </a>{" "}
        at build time. There is no second copy to fall behind, and a document is corrected by
        editing that file.
      </p>
    </div>
  )
}
