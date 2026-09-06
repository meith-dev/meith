import { navTabListVariants, navTabVariants, surfaceVariants } from '@meith/ui/variants'

export const PLUGIN_CARD = surfaceVariants({ padded: true })

export const PLUGIN_NOTE = surfaceVariants({ className: 'p-5 text-sm text-muted-foreground' })

export const PLUGIN_TAB_LIST = navTabListVariants()

export function pluginTabClass(active: boolean): string {
  return navTabVariants({ active })
}
