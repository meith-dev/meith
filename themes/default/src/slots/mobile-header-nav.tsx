import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'
import { NavigationDrawer, NavigationDrawerTrigger } from '@meith/ui'

const LINK =
  'flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted'

export function MobileHeaderNav({
  boardTitle,
  navigation,
  copy,
}: Pick<HeaderModel, 'boardTitle' | 'navigation'> & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.header.${key}`)
  return (
    <nav data-nav-view="mobile" aria-label={c('sections')} className="lg:hidden">
      {(['usercp', 'modcp'] as const).map((panel) => (
        <NavigationDrawerTrigger
          key={panel}
          target={`panel-${panel}-navigation`}
          data-panel-nav-trigger={panel}
          label={fromSlotCopy(copy, 'default.panelNav.open')}
        />
      ))}
      {navigation.length > 0 && (
        <div data-main-navigation>
          <NavigationDrawer
            id="board-mobile-navigation"
            title={boardTitle}
            openLabel={c('openMenu')}
            closeLabel={c('closeMenu')}
          >
            <ul className="flex flex-col gap-1">
              {navigation.map((item) => (
                <li key={item.href}>
                  {item.submenu !== undefined && item.submenu.length > 0 ? (
                    <details className="group/section">
                      <summary
                        className={`${LINK} cursor-pointer list-none justify-between gap-3 select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none`}
                      >
                        <span className="min-w-0 break-words">{item.label}</span>
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/section:rotate-90"
                        >
                          <path d="m6 4 4 4-4 4" />
                        </svg>
                      </summary>
                      <ul className="my-1 ms-3 flex flex-col gap-1 border-s border-border ps-2">
                        <li>
                          <a href={item.href} {...linkTarget(item)} className={LINK}>
                            {c('overview')}
                          </a>
                        </li>
                        {item.submenu.map((child) => (
                          <li key={child.href}>
                            <a href={child.href} {...linkTarget(child)} className={LINK}>
                              {child.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <a href={item.href} {...linkTarget(item)} className={LINK}>
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </NavigationDrawer>
        </div>
      )}
    </nav>
  )
}
