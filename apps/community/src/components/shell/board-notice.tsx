import 'server-only'

import { type NoticeModel, requireSlot, slotCopy } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'

import { NoticeToast } from './notice-toast'

async function NoticeBanner({ kind, message, dismissHref }: NoticeModel) {
  const theme = await currentTheme()
  const Notice = requireSlot(theme, 'Notice')

  const model = await filterView(
    'view.notice',
    { kind, message, dismissHref },
    viewerRef(await getActor()),
  )

  return <Notice {...model} copy={slotCopy(theme, 'Notice', await getTranslator())} />
}

export async function BoardNotice({ kind, message, dismissHref }: NoticeModel) {
  return (
    <>
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>[data-notice="toast"]{display:none!important}[data-notice="banner"]{display:block!important}</style>',
        }}
      />

      <NoticeToast kind={kind} message={message} />

      <div data-notice="banner" className="hidden">
        <NoticeBanner kind={kind} message={message} dismissHref={dismissHref} />
      </div>
    </>
  )
}
