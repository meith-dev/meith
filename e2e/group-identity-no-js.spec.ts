import { expect, test, type Page } from '@playwright/test'

/**
 * A member's group, as a reader actually sees it.
 *
 * Everything here needed a browser to prove, and two of them needed a browser
 * with **scripting off**, which is why the file is shaped like this rather than
 * as unit tests:
 *
 *  - the colour is delivered as a CSS rule in `<head>` and a class on the name,
 *    so "is it applied" is a question about the *cascade* — a unit test can
 *    assert the class is emitted and cannot tell you whether a theme's own
 *    `text-foreground` beats it. `getComputedStyle` can.
 *  - the badge is a real request to a real route. A unit test can assert the
 *    URL is built; only a browser can tell you the bytes come back and the
 *    image decodes.
 *  - the dark colour has to reach a reader on **"system"**, who has no `.dark`
 *    class on the page at all because their dark mode is a media query. That
 *    reader is the commonest one and the whole reason the colour is CSS instead
 *    of a value on the model.
 *
 * The board is seeded with one styled group — see `e2e/support/database.ts`.
 * `admin` is its only member, and every post in thread 4 is theirs.
 */
test.use({ javaScriptEnabled: false })

const THREAD = '/thread/4-welcome-to-the-community'

/** The seeded group's light colour, resolved by the browser to `rgb(...)`. */
const LIGHT = 'oklch(0.45 0.13 155)'
const DARK = 'oklch(0.85 0.14 155)'

/**
 * What a colour *renders* as, asked of the browser rather than parsed here.
 *
 * `getComputedStyle().color` comes back in whatever form the engine
 * normalises to, and that form is not this spec's business. Painting the same
 * declared value onto a throwaway element and reading it back gives the two
 * strings a common footing, so the assertion is "the name is this colour"
 * rather than "the name's colour string matches this regexp".
 */
async function asRendered(page: Page, declared: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('span')
    probe.style.color = value
    document.body.append(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    return computed
  }, declared)
}

function authorName(page: Page) {
  /* The postbit's own link to the author, not the "started by" in a listing. */
  return page.locator('article').first().getByRole('link', { name: 'admin', exact: true })
}

test("a group's colour reaches the name, and beats the theme's own", async ({ page }) => {
  await page.goto(THREAD)

  const name = authorName(page)
  await expect(name).toBeVisible()

  /*
   * The theme puts `text-foreground` on this element and the board's rule comes
   * from a different `<style>`, so what is being asserted is that the group's
   * colour is the one that *paints* — not merely that the class is in the HTML,
   * which is all a unit test can see.
   *
   * Stated honestly: this passes today even with an unrepeated selector,
   * because the framework happens to emit the board's block after the theme's.
   * That ordering is not contractual, which is why `renderGroupNameStyle`
   * doubles the class — and why the doubling is pinned by a unit test rather
   * than by this one. This test is the proof the colour arrives at all.
   */
  await expect(name).toHaveCSS('color', await asRendered(page, LIGHT))
})

test('the colour follows the reader into dark mode, chosen or inherited', async ({
  page,
  context,
}) => {
  /*
   * A reader who pressed "Dark": the page carries `.dark`, and the `.dark `
   * block is what paints them.
   */
  await context.addCookies([
    { name: 'meith_scheme', value: 'dark', url: 'http://127.0.0.1:3001' },
  ])
  await page.goto(THREAD)

  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  await expect(authorName(page)).toHaveCSS('color', await asRendered(page, DARK))
})

test('the colour follows a reader whose dark mode comes from the operating system', async ({
  browser,
}) => {
  /*
   * The reader this feature is actually built for. No cookie, so no `.dark`
   * class anywhere on the page — only `@media (prefers-color-scheme: dark)`
   * can reach them, and a design that put the colour in a `style` attribute
   * could not have.
   */
  const context = await browser.newContext({
    colorScheme: 'dark',
    javaScriptEnabled: false,
  })
  const page = await context.newPage()
  await page.goto(THREAD)

  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/)
  await expect(authorName(page)).toHaveCSS('color', await asRendered(page, DARK))

  await context.close()
})

test("the group's title, badge and reputation are in the postbit", async ({ page }) => {
  await page.goto(THREAD)

  const postbit = page.locator('article').first()

  /*
   * `PostAuthorModel.title` has been in the theme contract since F27 and was
   * hardcoded `null` at the only place that builds it, so every theme had a
   * slot for a member's standing and nothing to put in it. This is the line
   * that says it is filled.
   */
  await expect(postbit.getByText('Administrators', { exact: true })).toBeVisible()
  await expect(postbit.getByText(/\d+ reputation/)).toBeVisible()

  /*
   * The badge is `alt=""` and `aria-hidden` — the title beside it already says
   * the word — so it is found by its source rather than by an accessible name,
   * which is the correct way round for something decorative.
   */
  const badge = postbit.locator('img[src^="/group/3/badge/"]')
  await expect(badge).toHaveCount(1)

  /*
   * And it is a picture rather than a broken one. `naturalWidth` is 0 for an
   * image that failed to load, which is what a 404 from the route, a wrong
   * content type or a refused key would all produce.
   */
  await expect
    .poll(() => badge.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
})

/**
 * The colour is not a postbit feature.
 *
 * It was specified as "across the board", and the failure mode worth catching
 * is the *partial* one: a colour applied at five call sites out of six reads as
 * a rendering bug, because the same person is green in a thread and grey in a
 * listing.
 */
test('the same member is the same colour in a listing', async ({ page }) => {
  await page.goto('/community/100-announcements')

  const started = page.getByRole('link', { name: 'admin', exact: true }).first()
  await expect(started).toBeVisible()
  await expect(started).toHaveCSS('color', await asRendered(page, LIGHT))
})
