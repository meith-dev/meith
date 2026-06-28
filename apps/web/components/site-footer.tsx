import { MeithMark } from "@/components/meith-mark";
import { getDocsNav } from "@/lib/docs";
import { siteConfig } from "@/lib/site";
import Link from "next/link";

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

const productLinks = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Safety & control", href: "/#safety" },
  { label: "Download", href: siteConfig.releases, external: true },
];

export function SiteFooter() {
  const docsNav = getDocsNav();
  const groups: Array<{ title: string; links: FooterLink[] }> = [
    { title: "Product", links: productLinks },
    {
      title: "Documentation",
      links:
        docsNav
          .find((section) => section.title === "Using meith")
          ?.items.slice(0, 4)
          .map((item) => ({ label: item.title, href: item.href })) ?? [],
    },
    {
      title: "Developers",
      links:
        docsNav
          .find((section) => section.title === "Developers")
          ?.items.slice(1, 5)
          .map((item) => ({ label: item.title, href: item.href })) ?? [],
    },
  ];

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
              From the Irish <span className="italic">meitheal</span> — a gathering where
              everyone pitches in. Free and open source.
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
          <p>
            {`© ${new Date().getFullYear()} meith · Licensed under `}
            <a
              href={siteConfig.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline-offset-4 transition-colors hover:underline"
            >
              {siteConfig.license}
            </a>
          </p>
          <p>{siteConfig.platforms}</p>
        </div>
      </div>
    </footer>
  );
}
