'use client'

/**
 * A dropdown menu — shadcn/ui's, on Base UI's `Menu`.
 *
 * ## This is the board's one deliberate island in the page chrome
 *
 * Everything else in `@meith/ui`'s barrel renders on the server, and the header
 * sits in the layout of every page, so putting JavaScript there is a decision
 * rather than a default. It is made here because the alternative was worse: a
 * signed-in moderator is handed eight account links, and rendering all eight
 * inline turned the top-right corner of every page into a wall of text where
 * finding "Messages" took as long as reading the whole row.
 *
 * Base UI is what makes it worth the bytes. A hand-rolled menu is a `useState`
 * and a click-outside handler, and then it is a year of bugs: focus that does
 * not return to the trigger, Escape that does not close, arrow keys that do
 * nothing, a popup that renders under the next card, a trigger a screen reader
 * announces as a button with no `aria-expanded`. `Menu` brings all of that,
 * and `LinkItem` keeps the items real anchors — so middle-click and
 * open-in-new-tab still work, which is not true of a menu built out of
 * `onClick`.
 *
 * ## It is an enhancement, never the only way through
 *
 * The board works with scripting off (R5), and a trigger button whose popup
 * needs JavaScript is a dead control there. **The caller is responsible for a
 * `<noscript>` fallback** listing the same links — the board's `UserPanel` does
 * exactly that, so a browser with JavaScript disabled gets the plain row this
 * component replaced and nobody loses a route because an island did not load.
 *
 * It is the caller's job rather than this component's because `<noscript>` has
 * to be *outside* the trigger to be useful, and because only the caller knows
 * what the fallback should look like in its own layout.
 *
 * The trigger is rendered by the caller through `trigger`, so the server slot
 * decides what the control looks like and this module only decides how it
 * behaves.
 */

import { Menu as MenuPrimitive } from '@base-ui/react/menu'

import { cn } from './utils'

export interface MenuLink {
  readonly label: string
  readonly href: string
}

export interface MenuProps {
  /** The accessible name of the trigger, e.g. "Your account". */
  readonly label: string
  /** What the trigger looks like. Rendered inside a real `<button>`. */
  readonly trigger: React.ReactNode
  readonly triggerClassName?: string
  readonly items: readonly MenuLink[]
  /**
   * Controls the app owns — the log-out form, which is a POST to a Server
   * Action and can never be a link. Server-rendered and passed straight
   * through, so no action reference crosses into client code.
   */
  readonly children?: React.ReactNode
  /** Which side of the trigger the popup opens on. */
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
          /*
           * A viewport-relative gap so the popup never touches the window edge
           * on a phone, where the trigger is inches from it.
           */
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
                {/*
                  Not a `Menu.Item`: this is a `<form>` whose submit is a Server
                  Action, and wrapping it in an item would put a button inside a
                  menuitem — two overlapping roles, and a keyboard user tabbing
                  into a control the menu believes it owns. So it sits in the
                  popup as ordinary content and is *restyled* to match, from
                  here rather than at its source: the same control also renders
                  in the plain no-JavaScript row, where it should look like the
                  links around it instead.

                  A `<button>` centres its own text, so `w-full` alone would
                  leave "Log out" in the middle of a column of left-aligned
                  items — which is why `flex` and `justify-start` are here too.
                */}
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
