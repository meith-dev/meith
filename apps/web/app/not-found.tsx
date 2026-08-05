import Link from "next/link"

import { docHref, documentsInSection, sections } from "../src/docs/registry"

/**
 * A 404 that offers the documentation index rather than an apology.
 *
 * Most of the ways to reach this page are a stale link to a document — a rename,
 * or a `docs/…md` URL from the repository pasted into a browser — so the useful
 * thing to put here is the list of documents that do exist.
 */
export default function NotFound() {
  return (
    <div className="shell py-24">
      <p className="eyebrow eyebrow-rule">404</p>
      <h1 className="display mt-4 max-w-[18ch] text-huge leading-[1.02]">
        That field is not one of ours.
      </h1>
      <p className="mt-5 max-w-[38rem] text-mid leading-[1.45] text-ink-soft">
        The page you asked for is not here. If you were after documentation, every published
        document is below.
      </p>

      <div className="cell-grid mt-12 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <div key={section.id}>
            <h2 className="font-display text-mid font-semibold text-ink">{section.title}</h2>
            <ul className="flex flex-col gap-1">
              {documentsInSection(section.id).map((doc) => (
                <li key={doc.slug}>
                  <Link href={docHref(doc.slug)} className="textlink text-micro">
                    {doc.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-10">
        <Link href="/" className="btn">
          Back to the start
        </Link>
      </p>
    </div>
  )
}
