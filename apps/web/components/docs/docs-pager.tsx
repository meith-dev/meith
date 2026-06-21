"use client";

import { getAdjacentDocs } from "@/lib/docs-nav";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface DocsPagerProps {
  pathname?: string;
}

export function DocsPager({ pathname }: DocsPagerProps) {
  const runtimePathname = usePathname();
  const currentPathname = pathname ?? runtimePathname;
  const { prev, next } = getAdjacentDocs(currentPathname);

  if (!prev && !next) return null;

  return (
    <nav className="mt-14 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col gap-1 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeft className="size-3.5" />
            Previous
          </span>
          <span className="font-medium text-foreground">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col items-end gap-1 rounded-lg border border-border bg-card p-4 text-right transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Next
            <ArrowRight className="size-3.5" />
          </span>
          <span className="font-medium text-foreground">{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
