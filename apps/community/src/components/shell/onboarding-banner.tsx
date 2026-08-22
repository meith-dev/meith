import type { OnboardingNoticeModel } from '@/server/onboarding'
import { dismissOnboardingAction } from '@/server/onboarding-actions'

export function OnboardingBanner({
  panel,
  message,
  ctaHref,
  ctaLabel,
  dismissLabel,
}: OnboardingNoticeModel) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2 text-sm text-foreground">
      <p>
        {message}
        {ctaHref !== null && ctaLabel !== null && (
          <>
            {' '}
            <a
              href={ctaHref}
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              {ctaLabel}
            </a>
          </>
        )}
      </p>

      <form action={dismissOnboardingAction}>
        <input type="hidden" name="panel" value={panel} />
        <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
          {dismissLabel}
        </button>
      </form>
    </div>
  )
}
