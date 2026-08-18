import { buttonVariants, Separator } from '@meith/ui'

import type { SsoButtonModel } from '@/view/auth-copy'

import { type Copy, fromCopy } from '../shell/copy-record'

export function SsoButtons({
  providers,
  next,
  lede,
  copy,
}: {
  readonly providers: readonly SsoButtonModel[]
  readonly next?: string | undefined
  readonly lede?: string | undefined
  readonly copy: Copy
}) {
  if (providers.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {providers.map((provider) => (
          <form key={provider.id} method="post" action={`/auth/sso/${provider.id}`}>
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <button
              type="submit"
              className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-full' })}
            >
              {provider.cta}
            </button>
          </form>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{lede ?? fromCopy(copy, 'authForm.sso.lede')}</p>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {fromCopy(copy, 'authForm.or')}
        </span>
        <Separator className="flex-1" />
      </div>
    </div>
  )
}
