import type { PostActionsSlotModel } from '@meith/theme-kit'

const ACTION =
  'font-mono text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-primary'

export function PostActions({ actions, children }: PostActionsSlotModel) {
  const items = [
    { href: actions.quoteHref, label: 'quote' },
    { href: actions.editHref, label: 'edit' },
    { href: actions.restoreHref, label: 'restore' },
    { href: actions.rateHref, label: 'rate' },
    { href: actions.reportHref, label: 'report' },
    { href: actions.warnHref, label: 'warn' },
    { href: actions.moderateHref, label: 'moderate' },
  ].filter((item): item is { href: string; label: string } => item.href !== null)

  if (items.length === 0 && children === undefined) return null

  return (
    <nav aria-label="Post actions" className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <a key={item.label} href={item.href} className={ACTION}>
          {item.label}
        </a>
      ))}
      {children}
    </nav>
  )
}
