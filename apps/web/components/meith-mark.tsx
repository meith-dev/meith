import { cn } from "@/lib/utils"

/**
 * Meith brand mark.
 *
 * A "meitheal" — several workers gathering around one shared structure.
 * Three outer nodes (the renderer, the CLI, the agent) connect inward to a
 * single central hub (the tool registry) that does the heavy lifting.
 */
export function MeithMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Meith logo"
      className={cn("size-7", className)}
    >
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
        <line x1="16" y1="18.5" x2="16" y2="7.5" />
        <line x1="16" y1="18.5" x2="6.5" y2="24.5" />
        <line x1="16" y1="18.5" x2="25.5" y2="24.5" />
      </g>
      <g fill="currentColor" opacity="0.85">
        <circle cx="16" cy="7.5" r="2.6" />
        <circle cx="6.5" cy="24.5" r="2.6" />
        <circle cx="25.5" cy="24.5" r="2.6" />
      </g>
      <circle cx="16" cy="18.5" r="4.4" className="fill-primary" />
      <circle cx="16" cy="18.5" r="1.7" className="fill-primary-foreground" />
    </svg>
  )
}

export function MeithWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <MeithMark className="size-6 text-foreground" />
      <span className="text-lg font-semibold tracking-tight">meith</span>
    </span>
  )
}
