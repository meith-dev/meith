import Link from 'next/link'

import { docHref, documentsInSection, sections } from '../src/docs/registry'

export default function NotFound() {
  return (
    <div className="shell py-24">
      <p className="eyebrow">404</p>
      <h1 className="display mt-3 max-w-[18ch] text-huge leading-[1.05]">
        There is no page at this address.
      </h1>
      <p className="mt-5 max-w-[38rem] text-mid leading-[1.45] text-fg-muted">
        The page you asked for is not here. If you were after documentation, every published
        document is below.
      </p>

      <div className="card-grid mt-12 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <div key={section.id}>
            <h2 className="text-mid font-semibold tracking-[-0.02em] text-fg">{section.title}</h2>
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
