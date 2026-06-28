import { DocsShell } from "@/components/docs/docs-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDocsNav } from "@/lib/docs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s · meith docs",
  },
  description:
    "Learn how to use meith — the desktop workspace where AI agents browse, read files, run tasks, and get real work done.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sections = getDocsNav();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <DocsShell sections={sections}>{children}</DocsShell>
      </main>
      <SiteFooter />
    </div>
  );
}
