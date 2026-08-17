import { DocsNav, type NavSection } from '../../src/components/docs-nav'
import { documentsInSection, sections } from '../../src/docs/registry'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const nav: NavSection[] = sections.map((section) => ({
    id: section.id,
    title: section.title,
    documents: documentsInSection(section.id).map((doc) => ({
      slug: doc.slug,
      title: doc.title,
    })),
  }))

  return (
    <div className="shell-wide py-10 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      <details className="card mb-8 lg:hidden">
        <summary className="cursor-pointer px-4 py-3 font-mono text-[0.75rem] tracking-[0.12em] text-fg-subtle uppercase">
          Documents
        </summary>
        <div className="border-t border-border px-4 py-4">
          <DocsNav sections={nav} />
        </div>
      </details>

      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pb-8">
          <DocsNav sections={nav} />
        </div>
      </aside>

      {children}
    </div>
  )
}
