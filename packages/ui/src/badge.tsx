import { cn } from './utils'
import { type BadgeVariants, badgeVariants } from './variants'

function Badge({ className, tone, ...props }: React.ComponentProps<'span'> & BadgeVariants) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { Badge }
