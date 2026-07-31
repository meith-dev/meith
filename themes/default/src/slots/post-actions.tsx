import type { PostActionsSlotModel } from '@forum/theme-kit'

export function PostActions({ actions }: PostActionsSlotModel) {
  if (Object.values(actions).every((href) => href === null)) return null
  return (
    <nav aria-label="Post actions" className="flex gap-3 text-xs">
      {actions.quoteHref !== null && <a href={actions.quoteHref} className="hover:text-primary">Quote</a>}
      {actions.editHref !== null && <a href={actions.editHref} className="hover:text-primary">Edit</a>}
      {actions.restoreHref !== null && <a href={actions.restoreHref} className="hover:text-primary">Restore</a>}
      {actions.reportHref !== null && <a href={actions.reportHref} className="hover:text-primary">Report</a>}
      {actions.moderateHref !== null && <a href={actions.moderateHref} className="hover:text-primary">Moderate</a>}
    </nav>
  )
}
