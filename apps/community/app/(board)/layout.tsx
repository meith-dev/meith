import { OfflineNotice } from '@/components/shell/offline-notice'
import { PageShell } from '@/components/shell/page-shell'
import { boardOffline } from '@/server/board-offline'
import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { copyFor } from '@/view/copy'
import { untranslated } from '@/view/time'

export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const offline = await boardOffline()
  if (offline !== null) {
    const t = await getTranslator().catch(() => untranslated())
    return (
      <OfflineNotice
        message={offline.message}
        copy={copyFor(['offline.kicker', 'offline.title', 'offline.logIn'], t)}
      />
    )
  }

  return <PageShell actor={await getActor()}>{children}</PageShell>
}
