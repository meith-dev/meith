export const PLUGIN_CARD =
  'flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-elevation'

export const PLUGIN_NOTE =
  'rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground'

export const PLUGIN_TAB_LIST =
  'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1'

const PLUGIN_TAB_BASE =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function pluginTabClass(active: boolean): string {
  return active
    ? `${PLUGIN_TAB_BASE} bg-card font-semibold text-foreground shadow-sm`
    : `${PLUGIN_TAB_BASE} font-medium text-muted-foreground hover:text-foreground`
}
