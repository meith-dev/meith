"use client"

import { useState } from "react"
import { PanelLeft, X } from "lucide-react"
import { DocsSidebarNav } from "@/components/docs/docs-sidebar"
import { cn } from "@/lib/utils"

/**
 * Responsive docs layout: a persistent left sidebar on desktop, and a
 * slide-over drawer on mobile toggled by a button in the content column.
 */
export function DocsShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-10 sm:px-6">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-8">
          <DocsSidebarNav />
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute left-0 top-0 h-full w-72 border-r border-border bg-card p-4 transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold">Documentation</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
          </div>
          <DocsSidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-6 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        >
          <PanelLeft className="size-4" />
          Menu
        </button>
        <article className="max-w-3xl">{children}</article>
      </div>
    </div>
  )
}
