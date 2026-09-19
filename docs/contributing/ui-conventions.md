# Develop accessible interface components

Use the shared design system for forms, panels and destructive actions. Check keyboard, touch and JavaScript-disabled behavior when changing a user flow.

## Reviewing the design system

Run the populated fixture review with:

```sh
pnpm exec playwright test --config e2e/screenshot-ui-polish.config.ts
```

It starts the fixture board on port 3003. Screenshots and a browsable gallery
are written under `test-results/ui-polish/`. It covers all six registered themes in both
schemes, forum and thread reading, profiles, and touch layouts. Database-backed
workflows remain covered by the ordinary browser suite.

`e2e/ui-layout.spec.ts` keeps the important layout checks in the ordinary
browser suite: all themes at phone, tablet and desktop widths, compact
listing cards inside wide windows, and 44px touch controls. The shared
components and recipes are documented in [The theme API](../extensions/theme-design.md#shared-design-system).

The UI regression suite also covers password visibility with and without
JavaScript, Escape focus recovery in mobile navigation, hamburger drawers with
right-side placement, top-bar triggers and expandable sub-sections across all
six themes with JavaScript enabled and disabled,
and search-filter touch targets. Drawer alignment is checked against the document
content edge, which excludes the stable scrollbar gutter on platforms with
classic scrollbars. Header branding checks target the home link, because the
closed mobile drawer repeats the board name in its title. Run `e2e/ui-interactions.spec.ts` together with
`e2e/mobile-nav.spec.ts` and `e2e/ui-layout.spec.ts` after changing these controls.

## UI primitives and destructive actions

App components share the primitives in `@meith/ui` rather than re-declaring
the same class strings. A link that is prose — underlined, not a button —
is a `TextLink` (`@meith/ui`), whose `textLinkVariants` carries the one
underline recipe the whole board used to repeat inline; a link-styled
`<button>` reuses `textLinkVariants(...)` for the same reason. Reach for
these instead of writing `underline decoration-border …` again.

A **destructive action confirms itself, fallback-first.** The server action
calls `requireConfirmation(form, message)` (`server/confirm.ts`): when the
submission carries no `confirmed` field it returns the message and a
snapshot of the submitted fields as `state.confirm` and does nothing else.
The client `ConfirmDialog` renders that state two ways from one markup — a
`@meith/ui/dialog` `AlertDialog` when scripting is on, and, under
`<noscript>`, a plain interstitial that re-submits the snapshot with
`confirmed=1`. **The interstitial is the real path; the dialog is the
enhancement**, which is why the no-JS specs step through the confirm page
rather than skipping it (empty trash and delete-forever in
`undo-no-js.spec.ts`, post and thread deletion in `moderation-no-js.spec.ts`,
token revocation on the enhanced path in `admin-panel-live.spec.ts`). It is
applied to every destructive admin action that has no other guard: API
token revocation, attachment / announcement / prefix / word-filter / smiley
/ captcha-question / directive deletion, navigation-link deletion, and
ban-filter removal. Admin operations already guarded by the
preview-and-undo pattern (`admin-undo.tsx`) or a fresh-password re-check
(group and promotion-rule deletion) keep those guards instead, and three
one-click removals are deliberately left un-gated because they destroy
nothing that cannot be put straight back — the favicon and logo (re-upload)
and a badge definition.

A **notice is a toast, with the banner as its fallback.** Actions still
redirect carrying the notice in the query string; `BoardNotice` renders the
`@meith/ui/toast` `Toast` island — dismissible, auto-dismissing,
`role="status"` — and keeps the theme's `Notice` banner under `<noscript>`,
toggled by the same `data-`attribute-and-`<noscript>`-style pattern the
notification and user menus use. **Tooltips** (`@meith/ui/tooltip`) label
cramped icon controls such as the multiquote toggle; they open on hover and
focus, so the control still needs its own accessible name for touch and
screen readers.
