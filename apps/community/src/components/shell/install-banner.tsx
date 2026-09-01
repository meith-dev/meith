import { PendingButton } from '@/components/auth/form-controls'
import { InstallAction } from '@/components/shell/install-action'
import { BOARD_MEASURE } from '@/components/shell/measure'
import type { InstallBannerModel } from '@/server/install-banner'
import { dismissInstallBannerAction } from '@/server/install-banner-actions'

export function InstallBanner({ message, how, installLabel, dismissLabel }: InstallBannerModel) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card text-sm text-foreground shadow-lg md:hidden [@media(display-mode:standalone)]:hidden">
      <div
        className={`${BOARD_MEASURE} relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
      >
        <p>{message}</p>

        <div className="flex items-center gap-3">
          <InstallAction label={installLabel} how={how} />
          <form action={dismissInstallBannerAction}>
            <PendingButton
              showWorking
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {dismissLabel}
            </PendingButton>
          </form>
        </div>
      </div>
    </div>
  )
}
