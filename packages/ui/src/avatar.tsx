import { cn } from './utils'

export interface AvatarProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  readonly src?: string | null
  readonly name: string
  readonly size?: number
}

function Avatar({ className, src = null, name, size = 40, ...props }: AvatarProps) {
  const initial = (Array.from(name.trim())[0] ?? '?').toUpperCase()

  return (
    <span
      data-slot="avatar"
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-md border border-primary/15 bg-primary/10',
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      {src === null ? (
        <span className="font-semibold text-primary" style={{ fontSize: Math.round(size * 0.42) }}>
          {initial}
        </span>
      ) : (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      )}
    </span>
  )
}

export { Avatar }
