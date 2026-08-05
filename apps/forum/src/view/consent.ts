/**
 * Cookie consent: what actually needs it, and where it is asked for.
 *
 * ## What this board stores, and why most of it is not a consent question
 *
 * The ePrivacy Directive (Article 5(3), which is what a "cookie banner" is
 * really about — the GDPR governs what you do with the data afterwards) exempts
 * storage that is *strictly necessary* to provide a service the user explicitly
 * asked for. Every cookie this board sets on its own is in that category:
 *
 * | Cookie | Why it is exempt |
 * |---|---|
 * | session / remember-me | signing in is a service explicitly requested |
 * | CSRF | security of that same service |
 * | `meith_theme`, `meith_scheme` | user-interface customisation, written *only* in direct response to the member pressing a control — the EDPB names this case |
 * | `meith_consent` | records the answer to this very question; asking again forever would be worse |
 *
 * None of them are shared, none identify anybody across sites, and none exist
 * before somebody asks for them. **So the banner is not about them**, and
 * pretending otherwise would be the dishonest kind of cookie notice: one that
 * asks for consent it does not need, trains people to click through, and buries
 * the one choice that matters.
 *
 * What it *is* about is the analytics the board can send to a third party. That
 * is the only processing here that a reader has a genuine interest in refusing,
 * so it is the only thing gated — and it is gated properly, by not rendering
 * the script at all rather than by loading it and hoping.
 *
 * ## "Only in GDPR regions"
 *
 * Resolved from the country header a CDN attaches — `x-vercel-ip-country` on
 * Vercel, `cf-ipcountry` behind Cloudflare. A self-hosted board behind neither
 * has no such header, and the honest answer to "which country is this?" is then
 * *unknown*.
 *
 * Unknown is treated as in scope. Getting it wrong in that direction shows a
 * banner to somebody who did not need to see one; getting it wrong the other
 * way processes a European reader's data without asking. Those are not
 * comparable mistakes. An operator who knows better sets `privacy.cookie_consent`
 * to `off` or `always` and stops guessing.
 *
 * **This is a mechanism, not legal advice.** What a particular board must ask
 * and record depends on what it does with the data, and that is the operator's
 * to decide.
 */

export const CONSENT_COOKIE = 'meith_consent'

/** Six months. Long enough not to nag, short enough that a stale yes expires. */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 182

export const CONSENT_CHOICES = ['granted', 'denied'] as const
export type ConsentChoice = (typeof CONSENT_CHOICES)[number]

export function isConsentChoice(value: unknown): value is ConsentChoice {
  return CONSENT_CHOICES.includes(value as ConsentChoice)
}

/**
 * The EEA, the United Kingdom and Switzerland, as ISO 3166-1 alpha-2.
 *
 * The EEA is the EU plus Iceland, Liechtenstein and Norway. The UK is here
 * because the UK GDPR and PECR say the same things after Brexit, and
 * Switzerland because the revised FADP does too — an operator asking "do I need
 * a banner in Zurich" wants the same answer, and a list that omitted it would
 * be a list somebody has to remember to correct.
 */
export const CONSENT_REGIONS: ReadonlySet<string> = new Set([
  // EU
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  // EEA, beyond the EU
  'IS', 'LI', 'NO',
  // Same rules, different statute book
  'GB', 'CH',
])

/** What an operator can choose. Matches `privacy.cookie_consent`. */
export type ConsentMode = 'auto' | 'always' | 'off'

/**
 * Does this request need to be asked?
 *
 * @param country - ISO alpha-2 from a CDN header, or `null` when no header
 * said. Null is in scope under `auto`; see the note above for why the two
 * failure directions are not symmetric.
 */
export function consentRequired(mode: ConsentMode, country: string | null): boolean {
  if (mode === 'off') return false
  if (mode === 'always') return true
  return country === null || CONSENT_REGIONS.has(country.toUpperCase())
}

/**
 * The headers a CDN uses to say where a request came from, most specific first.
 *
 * Only ever read, never trusted for anything but this: a forged header shows
 * somebody a banner they could have dismissed, which is not a security
 * boundary and does not need to be one.
 */
export const COUNTRY_HEADERS = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'x-country-code',
  'x-geo-country',
] as const

/** Read the first country header that is present and looks like one. */
export function countryFrom(headers: {
  get(name: string): string | null | undefined
}): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = headers.get(name)
    if (typeof value !== 'string') continue

    const code = value.trim().toUpperCase()
    /*
     * Cloudflare sends `XX` for a client whose country it could not determine
     * and `T1` for Tor. Both mean "unknown", and reading them as a country
     * would silently take a European reader out of scope.
     */
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') return code
  }
  return null
}
