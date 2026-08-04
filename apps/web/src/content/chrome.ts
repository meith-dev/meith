/**
 * The two colours the browser paints its own chrome with.
 *
 * These are the one place in this app a colour is written outside
 * `globals.css`, and it is unavoidable: `<meta name="theme-color">` is read
 * before any stylesheet has loaded, so it cannot be `var(--ground)`. Everything
 * else — every component, every page — goes through the tokens.
 *
 * They are duplicates of `--ground` in each scheme, which is exactly the kind of
 * copy that drifts. `chrome.test.ts` reads `globals.css` and fails when it does.
 */
export const chromeColour = {
  light: "#EEF0E8",
  dark: "#14180F",
} as const
