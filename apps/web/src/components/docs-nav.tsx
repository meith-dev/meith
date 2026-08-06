"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export interface NavSection {
  readonly id: string
  readonly title: string
  readonly documents: readonly { readonly slug: string; readonly title: string }[]
}

interface DocsNavProps {
  readonly sections: readonly NavSection[]
}

export function DocsNav({ sections }: DocsNavProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Documentation">
      <Link
        href="/docs"
        className={`mb-6 block font-mono text-micro tracking-[0.14em] uppercase transition-colors ${
          pathname === "/docs" ? "text-gorse" : "text-ink-faint hover:text-ink"
        }`}
      >
        All documents
      </Link>

      <ul className="flex flex-col gap-6">
        {sections.map((section) => (
          <li key={section.id}>
            <p className="eyebrow mb-2">{section.title}</p>
            <ul className="flex flex-col gap-0.5 border-l border-wall">
              {section.documents.map((doc) => {
                const href = `/docs/${doc.slug}`
                const active = pathname === href
                return (
                  <li key={doc.slug}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`-ml-px block border-l py-1 pl-3 text-micro leading-snug transition-colors ${
                        active
                          ? "border-gorse text-gorse"
                          : "border-transparent text-ink-soft hover:border-lichen hover:text-ink"
                      }`}
                    >
                      {doc.title}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}
