/**
 * Cookie consent: what actually needs it, and where it is asked for.
 *
 * ## The two categories, and why only one is a question
 *
 * The ePrivacy Directive (Article 5(3), which is what a "cookie banner" is
 * really about — the GDPR governs what you do with the data afterwards) exempts
 * storage that is *strictly necessary* to provide a service the user explicitly
 * asked for. Everything this board stores on its own is in that category:
 * signing in, the security of that session, and the preferences a reader sets
 * by pressing a control. None of them are shared, none identify anybody across
 * sites, and none exist before somebody asks for them.
 *
 * **So the notice is not about those**, and pretending otherwise would be the
 * dishonest kind of cookie notice: one that asks for consent it does not need,
 * trains people to click through, and buries the one choice that matters.
 *
 * What it *is* about is `OPTIONAL_PROCESSING` below — the things a reader has a
 * genuine interest in refusing. There is one today. Adding a second is one
 * entry in that list and one `allows()` check at the point of use; the notice,
 * the toggle and the documentation all read the list rather than naming
 * anything, which is what stops a board growing a tracker the banner does not
 * mention.
 *
 * ## "Only in GDPR regions"
 *
 * Resolved from the country header a CDN attaches — `x-vercel-ip-country` on
 * Vercel, `cf-ipcountry` behind Cloudflare. A self-hosted board behind neither
 * has no such header, and the honest answer to "which country is this?" is then
 * *unknown*.
 *
 * Unknown is treated as in scope. Getting it wrong in that direction shows a
 * notice to somebody who did not need one; getting it wrong the other way
 * processes a European reader's data without asking. Those are not comparable
 * mistakes. An operator who knows better sets `privacy.cookie_consent` to `off`
 * or `always` and stops guessing.
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
 * What the board stores no matter what, described for a reader rather than for
 * a lawyer.
 *
 * Named categories, not cookie names. "meith_scheme" tells a reader nothing,
 * and a list that enumerated every cookie would go stale the first time one was
 * renamed — while a category survives the rename and is what somebody reading a
 * notice actually wants to know.
 */
export const ESSENTIAL_PROCESSING: readonly { key: string; label: string }[] = [
  { key: 'session', label: 'Keeping you signed in, and keeping that session secure' },
  { key: 'preferences', label: 'Remembering the settings you choose here, in this browser' },
]

/**
 * Everything the board will not do until it is allowed to.
 *
 * One entry today. It is a list rather than a boolean so that adding the second
 * is a change in one place that the notice, the toggle and the operator
 * documentation all pick up — a second optional thing gated by a second ad-hoc
 * flag is how a board ends up with a banner that describes half of what it does.
 */
export const OPTIONAL_PROCESSING: readonly { key: string; label: string }[] = [
  { key: 'analytics', label: 'Anonymous usage statistics, so the board can see what is read' },
]

/** The EEA, the United Kingdom and Switzerland, as ISO 3166-1 alpha-2. */
export const CONSENT_REGIONS: ReadonlySet<string> = new Set([
  // EU
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  // EEA, beyond the EU
  'IS', 'LI', 'NO',
  /*
   * Same rules, different statute book: the UK GDPR and PECR say what the EU
   * pair say after Brexit, and Switzerland's revised FADP does too. An operator
   * asking "do I need a notice in Zurich" wants the same answer, and a list
   * that omitted it would be one somebody has to remember to correct.
   */
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
 * somebody a notice they could have dismissed, which is not a security boundary
 * and does not need to be one.
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
