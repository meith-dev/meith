import { PendingButton } from '@/components/auth/form-controls'
import { BOARD_MEASURE } from '@/components/shell/measure'
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
    <div className="border-b border-border bg-muted text-sm text-foreground">
      <div className={`${BOARD_MEASURE} flex flex-wrap items-center justify-between gap-3 py-2`}>
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
          <PendingButton
            showWorking
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {dismissLabel}
          </PendingButton>
        </form>
      </div>
    </div>
  )
}
