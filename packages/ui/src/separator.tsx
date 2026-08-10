import { cn } from './utils'

export interface SeparatorProps extends React.ComponentProps<'div'> {
  readonly orientation?: 'horizontal' | 'vertical'
  readonly decorative?: boolean
}

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'separator',
            ...(orientation === 'vertical' ? { 'aria-orientation': 'vertical' as const } : {}),
          })}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-4 w-px self-center',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
