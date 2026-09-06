import { cn } from './utils'

function PageHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="page-header"
      className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}
      {...props}
    />
  )
}

function PageHeaderContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header-content"
      className={cn('flex min-w-0 flex-1 basis-64 flex-col gap-2', className)}
      {...props}
    />
  )
}

function PageTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1
      data-slot="page-title"
      className={cn(
        'font-heading text-2xl font-semibold tracking-tight text-balance text-foreground [overflow-wrap:anywhere] sm:text-3xl',
        className,
      )}
      {...props}
    />
  )
}

function PageDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="page-description"
      className={cn('max-w-prose text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  )
}

function PageHeaderActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn('flex max-w-full flex-wrap items-center gap-2', className)}
      {...props}
    />
  )
}

export { PageDescription, PageHeader, PageHeaderActions, PageHeaderContent, PageTitle }
