import { BOARD_MEASURE } from '@/components/shell/measure'
import { setConsentAction } from '@/server/consent-actions'
import { getConsentState } from '@/server/consent'
import { ESSENTIAL_PROCESSING, OPTIONAL_PROCESSING } from '@/view/consent'

const BUTTON =
  'inline-flex h-9 min-w-28 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export async function CookieNotice() {
  const { required, choice } = await getConsentState()
  if (!required || choice !== null) return null

  return (
    <aside
      aria-label="Cookies"
      className="border-t border-border bg-card text-card-foreground"
    >
      { }
      <div
        className={`${BOARD_MEASURE} flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8`}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm">
            This site stores what it needs in order to work. May we also collect{' '}
            { }
            {OPTIONAL_PROCESSING.map((item) => item.label.toLowerCase()).join(', and ')}?
          </p>

          { }
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none underline decoration-border underline-offset-2 hover:decoration-foreground">
              What is stored
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <div>
                <p className="font-medium text-foreground">Always, and not part of this question</p>
                <ul className="mt-1 list-disc pl-4">
                  {ESSENTIAL_PROCESSING.map((item) => (
                    <li key={item.key}>{item.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Only if you allow it</p>
                <ul className="mt-1 list-disc pl-4">
                  {OPTIONAL_PROCESSING.map((item) => (
                    <li key={item.key}>{item.label}</li>
                  ))}
                </ul>
                <p className="mt-1">
                  Nothing in this second list runs until you say yes, and you can
                  change your answer at the foot of any page.
                </p>
              </div>
            </div>
          </details>
        </div>

        <form action={setConsentAction} className="flex shrink-0 flex-wrap items-center gap-2">
          { }
          <button type="submit" name="consent" value="denied" className={BUTTON}>
            No thanks
          </button>
          <button type="submit" name="consent" value="granted" className={BUTTON}>
            Allow
          </button>
        </form>
      </div>
    </aside>
  )
}

export async function ConsentToggle() {
  const { required, choice } = await getConsentState()
  if (!required || choice === null) return null

  const granted = choice === 'granted'

  return (
    <section aria-label="Privacy" className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        { }
        {OPTIONAL_PROCESSING.length === 1 ? 'Usage statistics' : 'Optional data'}
      </span>
      <form action={setConsentAction}>
        <button
          type="submit"
          name="consent"
          value={granted ? 'denied' : 'granted'}
          aria-pressed={granted}
          className={`inline-flex h-8 items-center rounded-md border border-border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            granted
              ? 'bg-primary font-medium text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {granted ? 'Allowed' : 'Off'}
        </button>
      </form>
    </section>
  )
}
