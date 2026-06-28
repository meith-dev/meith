"use client";

import type { DocSection } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DocsSidebarNav({
  onNavigate,
  sections,
}: {
  onNavigate?: () => void;
  sections: DocSection[];
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-7" aria-label="Documentation">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
          <ul className="mt-2 space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
