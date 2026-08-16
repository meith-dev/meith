import { Separator, buttonVariants } from "@meith/ui"

import type { ProviderButton } from "@/server/federation"

export function SsoButtons({
  providers,
  next,
  lede,
}: {
  readonly providers: readonly ProviderButton[]
  readonly next?: string | undefined
  readonly lede?: string | undefined
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
              className={buttonVariants({ variant: "outline", size: "lg", className: "w-full" })}
            >
              Continue with {provider.label}
            </button>
          </form>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {lede ??
          "Signing in this way tells that provider you are a member here, and the board " +
            "learns the address they hold for you. Nothing else passes between them."}
      </p>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>
    </div>
  )
}
