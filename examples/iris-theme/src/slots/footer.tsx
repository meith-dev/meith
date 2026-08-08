import type { FooterModel } from '@meith/theme-kit'

/**
 * Iris's one markup override.
 *
 * Where the default footer is a left-to-right bar, iris stacks and centres it
 * under a heavier rule in the brand colour — enough to prove the override took
 * without inheriting anything by accident.
 *
 * What any Footer owes the reader is the same in every theme: the board's
 * title, each footer link the app resolved (an href arrives resolved — a theme
 * never builds a URL), and the timezone note, because every timestamp on the
 * board was formatted server-side in that zone. The rendering-contract suite
 * (`apps/forum/src/theme/contract.test.ts`) checks those appear.
 *
 * Colours come from tokens only — `no-hardcoded-colour` rejects a hex literal
 * in a theme, so a board's operator can restyle this footer without reaching
 * into it.
 */
export function Footer({ boardTitle, links, timezoneLabel, poweredBy }: FooterModel) {
  return (
    <footer className="mt-auto border-t-2 border-primary bg-card">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-widest text-foreground">
          {boardTitle}
        </span>

        {links.length > 0 && (
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="underline decoration-primary underline-offset-2 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <span>
          Times are shown in {timezoneLabel}
          {poweredBy && (
            <>
              {' — '}
              <a
                href={poweredBy.href}
                className="underline decoration-primary underline-offset-2 hover:text-foreground"
              >
                {poweredBy.label}
              </a>
            </>
          )}
        </span>
      </div>
    </footer>
  )
}
