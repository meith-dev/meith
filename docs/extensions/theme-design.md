# Theme tokens and controls

## Palettes

Use token names from the default theme. Provide separate light and dark palettes; legacy flat overrides apply to both schemes.

The compiled default palette is followed by the board default and its overrides in `:root`/`.dark`. Other themes emit scoped differences from that board default. Keep foreground/background pairs readable in both schemes.

`BROWSER_THEME_COLOR` uses a hex background colour. Colour helpers support the documented hex and OKLCH forms and return `null` for unsupported input.

Use semantic tokens for backgrounds, text, borders, focus and status. Avoid hardcoded colours that bypass the selected theme.

## Shared components

The main `@meith/ui` barrel is server-safe. Interactive controls use explicit client subpaths.

| Component or recipe | Use |
|---|---|
| `PageHeader`, `PageContent` | Page structure |
| `PageTitle`, `PageDescription`, `PageActions` | Heading and actions |
| `NavTabs` | Native linked tabs with optional enhancement |
| `controlVariants` | Consistent control sizing and states |
| `PasswordInput` | Password visibility control; compose with `Field`, not a wrapping label |

Use 4px spacing increments. Standard controls are 40px and grow to 44px for coarse pointers; compact controls can be 32px on fine pointers. Preserve the 2px focus ring and disabled states. Touch inputs must compute to at least 16px to prevent browser zoom.

Cards use container queries; `@3xl/card` is 48rem. Test narrow containers as well as narrow viewports. The standard board width is 1280px.

## Navigation

Use the shared `NavigationDrawer` native popover for mobile navigation. Place it at the end edge. The header and panel use a single hamburger target, with localized copy and the shared `MobilePanelNav` structure.

Navigation groups use native disclosures with an Overview link. Preserve desktop/mobile data markers on the expected direct children; layout tests use them.

| Enhancement marker | Optional behaviour |
|---|---|
| `data-nav-tabs` | Horizontal tab navigation |
| `data-nav-disclosure` | Focus and Escape handling |
| `data-header-peek` | Header visibility while scrolling |

Without JavaScript, links, disclosures and the sticky header must remain usable. Do not hide required content behind an enhancement.

## Forms and content

Pass through app-owned forms and rendered regions. Keep native labels, validation messages and submit controls accessible. Preserve post anchors and target spacing from the [theme contract](theme-contract.md#post-links).

Check long titles, empty states, tables, code blocks, error messages and translated labels. Follow [Theme testing](theme-testing.md) before publishing.
