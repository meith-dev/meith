import { demoBannerModel } from '@/server/demo'
import { getTranslator } from '@/server/i18n'
import { splitAround } from '@/view/copy'

/**
 * The strip at the top of a demo board.
 *
 * Rendered from the root layout rather than through a theme slot, on purpose:
 * the slot contract is frozen, and a visiting administrator can switch themes.
 * A banner a theme could decline to render is a banner that stops telling the
 * next visitor how to log in, on the first theme that has not heard of it.
 */
export async function DemoBanner() {
  const banner = await demoBannerModel()
  if (banner === null) return null

  const t = await getTranslator()
  const [loginLead, loginTail] = splitAround(t, 'demo.loginAs', 'logins')

  return (
    <aside
      className="border-b border-border bg-muted px-4 py-2 text-sm text-muted-foreground"
      aria-label={t.t('demo.aria')}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-4 gap-y-1">
        <strong className="font-semibold text-foreground">{t.t('demo.title')}</strong>

        <span>
          {loginLead}
          {banner.logins.map((login, index) => (
            <span key={login.username}>
              {index > 0 && ', '}
              <code className="rounded bg-background px-1 py-0.5 font-mono text-foreground">
                {login.username} / {login.password}
              </code>
            </span>
          ))}
          {loginTail}
        </span>

        <span>
          {banner.resetsIn === null
            ? t.t('demo.wiped')
            : t.t('demo.wipedIn', { when: banner.resetsIn })}
        </span>
      </div>
    </aside>
  )
}
