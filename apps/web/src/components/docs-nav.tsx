'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface NavSection {
  readonly id: string
  readonly title: string
  readonly documents: readonly {
    readonly slug: string
    readonly title: string
    readonly group?: string | undefined
  }[]
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
        className={`mb-6 block font-mono text-[0.75rem] tracking-[0.12em] uppercase transition-colors ${
          pathname === '/docs' ? 'text-accent' : 'text-fg-subtle hover:text-fg'
        }`}
      >
        All documents
      </Link>

      <ul className="flex flex-col gap-6">
        {sections.map((section) => (
          <li key={section.id}>
            <p className="eyebrow mb-2">{section.title}</p>
            <ul className="flex flex-col gap-0.5 border-l border-border">
              {section.documents.map((doc, index) => {
                const href = `/docs/${doc.slug}`
                const active = pathname === href
                const groupStarts =
                  doc.group !== undefined && doc.group !== section.documents[index - 1]?.group
                return (
                  <li key={doc.slug}>
                    {groupStarts ? (
                      <p className="mt-2 mb-1 pl-3 font-mono text-[0.65rem] tracking-[0.1em] text-fg-subtle uppercase">
                        {doc.group}
                      </p>
                    ) : null}
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={`-ml-px block border-l py-1 text-micro leading-snug transition-colors ${
                        doc.group !== undefined ? 'pl-5' : 'pl-3'
                      } ${
                        active
                          ? 'border-accent text-accent'
                          : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg'
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
