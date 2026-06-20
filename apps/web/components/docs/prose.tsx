import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Top-of-page heading + lede for a docs article. */
export function DocHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <header className="mb-8 border-b border-border pb-8">
      {eyebrow ? (
        <p className="font-mono text-xs uppercase tracking-wide text-primary">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-2 text-balance text-4xl font-bold tracking-tight">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  )
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-12 scroll-mt-24 text-2xl font-semibold tracking-tight first:mt-0"
    >
      {children}
    </h2>
  )
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mt-8 scroll-mt-24 text-lg font-semibold tracking-tight">
      {children}
    </h3>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 leading-relaxed text-muted-foreground">{children}</p>
}

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-lg leading-relaxed text-foreground/90">{children}</p>
  )
}

/** Inline monospace token for code, tool names, paths, IDs. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  )
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-4 space-y-2 text-muted-foreground marker:text-muted-foreground/60 [&>li]:ml-5 [&>li]:list-disc [&>li]:pl-1.5 [&>li]:leading-relaxed">
      {children}
    </ul>
  )
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="mt-4 space-y-2 text-muted-foreground marker:text-muted-foreground/60 [&>li]:ml-5 [&>li]:list-decimal [&>li]:pl-1.5 [&>li]:leading-relaxed">
      {children}
    </ol>
  )
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http")
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {children}
      </a>
    )
  }
  return (
    <Link
      href={href}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  )
}

/** A callout for notes, tips, and warnings. */
export function Callout({
  variant = "note",
  title,
  children,
}: {
  variant?: "note" | "warning"
  title?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "mt-6 rounded-lg border p-4 text-sm leading-relaxed",
        variant === "warning"
          ? "border-destructive/40 bg-destructive/5"
          : "border-primary/30 bg-primary/5",
      )}
    >
      {title ? (
        <p className="font-semibold text-foreground">{title}</p>
      ) : null}
      <div className={cn("text-muted-foreground", title && "mt-1")}>
        {children}
      </div>
    </div>
  )
}

/** A two-column grid of summary cards used on overview pages. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="mt-8 grid gap-4 sm:grid-cols-2">{children}</div>
}

export function DocCard({
  href,
  title,
  children,
}: {
  href: string
  title: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <p className="font-semibold tracking-tight">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </Link>
  )
}
