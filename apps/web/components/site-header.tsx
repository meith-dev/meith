"use client"

import { useState } from "react"
import Link from "next/link"
import { GitFork, Menu, X } from "lucide-react"
import { MeithMark } from "@/components/meith-mark"
import { Button } from "@/components/ui/button"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="meith home">
          <MeithMark className="size-7 text-foreground" />
          <span className="text-lg font-semibold tracking-tight">meith</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <a href={siteConfig.repo} target="_blank" rel="noreferrer">
              <GitFork className="size-4" />
              GitHub
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={siteConfig.releases} target="_blank" rel="noreferrer">
              Download
            </a>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-10 items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <div
        className={cn(
          "border-t border-border/70 md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={siteConfig.repo} target="_blank" rel="noreferrer">
                <GitFork className="size-4" />
                View on GitHub
              </a>
            </Button>
            <Button asChild size="sm">
              <a href={siteConfig.releases} target="_blank" rel="noreferrer">
                Download for desktop
              </a>
            </Button>
          </div>
        </nav>
      </div>
    </header>
  )
}
