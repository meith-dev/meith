'use client'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'

import { cn } from './utils'

export interface MenuLink {
  readonly label: string
  readonly href: string
}

export interface MenuProps {
  readonly label: string
  readonly trigger: React.ReactNode
  readonly triggerClassName?: string
  readonly items: readonly MenuLink[]
  readonly children?: React.ReactNode
  readonly align?: 'start' | 'center' | 'end'
}

function Menu({ label, trigger, triggerClassName, items, children, align = 'end' }: MenuProps) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        aria-label={label}
        className={cn(
          'inline-flex cursor-default items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-sm',
          'transition-colors hover:bg-muted data-[popup-open]:bg-muted',
          triggerClassName,
        )}
      >
        {trigger}
      </MenuPrimitive.Trigger>

      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 outline-none"
        >
          <MenuPrimitive.Popup
            className={cn(
              'min-w-52 origin-[var(--transform-origin)] overflow-hidden rounded-lg border border-border bg-card p-1 text-card-foreground shadow-lg',
              'transition-[opacity,transform] duration-100 ease-out',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            )}
          >
            {items.map((item) => (
              <MenuPrimitive.LinkItem
                key={item.href}
                href={item.href}
                closeOnClick
                className={cn(
                  'flex cursor-default items-center rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none select-none',
                  'data-[highlighted]:bg-muted',
                )}
              >
                {item.label}
              </MenuPrimitive.LinkItem>
            ))}

            {children !== undefined && children !== null && (
              <>
                <MenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
                { }
                <div
                  className={cn(
                    '[&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:justify-start',
                    '[&_button]:rounded-md [&_button]:px-2.5 [&_button]:py-1.5 [&_button]:text-sm',
                    '[&_button]:font-normal [&_button:hover]:bg-muted [&_button:hover]:no-underline',
                  )}
                >
                  {children}
                </div>
              </>
            )}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  )
}

export { Menu }
