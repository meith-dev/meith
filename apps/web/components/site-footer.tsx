import Link from "next/link"
import { MeithMark } from "@/components/meith-mark"
import { siteConfig } from "@/lib/site"

const groups = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Safety & control", href: "/#safety" },
      { label: "Download", href: siteConfig.releases, external: true },
    ],
  },
  {
    title: "Documentation",
    links: [
      { label: "Getting started", href: "/docs" },
      { label: "Using meith", href: "/docs/using-meith" },
      { label: "Spaces & tabs", href: "/docs/spaces" },
      { label: "Tools & permissions", href: "/docs/tools" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Architecture", href: "/docs/developers/architecture" },
      { label: "Tool protocol", href: "/docs/developers/tool-protocol" },
      { label: "Adding tools", href: "/docs/developers/adding-tools" },
      { label: "Plugin API", href: "/docs/developers/plugin-api" },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-2.5" aria-label="meith home">
              <MeithMark className="size-7 text-foreground" />
              <span className="text-lg font-semibold tracking-tight">meith</span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              From the Irish <span className="italic">meitheal</span> — a gathering
              where everyone pitches in. Free and open source.
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{`© ${new Date().getFullYear()} meith · Free and open source`}</p>
          <p>{siteConfig.platforms}</p>
        </div>
      </div>
    </footer>
  )
}
