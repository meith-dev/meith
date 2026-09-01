'use client'

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

import { cn } from './utils'

export interface TooltipProps {
  readonly label: React.ReactNode
  readonly children: React.ReactElement
  readonly side?: 'top' | 'bottom' | 'left' | 'right'
  readonly align?: 'start' | 'center' | 'end'
  readonly delay?: number
  readonly className?: string
}

export function Tooltip({
  label,
  children,
  side = 'top',
  align = 'center',
  delay = 300,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger delay={delay} render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-50"
        >
          <TooltipPrimitive.Popup
            className={cn(
              'max-w-64 origin-[var(--transform-origin)] rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground shadow-md',
              'duration-100 ease-out transition-[opacity,transform]',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
              className,
            )}
          >
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
