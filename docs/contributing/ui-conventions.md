# UI conventions

Use shared `@meith/ui` components and theme tokens. Keep controls at least 44px on touch devices and preserve keyboard focus. See [Theme controls](../extensions/theme-design.md).

## Links and feedback

Use the shared `TextLink` recipe for inline links. Tooltips must also work on focus; controls still need an accessible name.

Success notices use `BoardNotice`: enhanced pages show a status toast, and the theme notice provides the no-JavaScript fallback. Keep validation errors next to their fields and focus the shared error summary when needed.

## Destructive actions

Use `requireConfirmation` to return `state.confirm` with a snapshot of the intended action. The first submission must not mutate data.

`ConfirmDialog` supplies the native/no-script flow, which resubmits with `confirmed=1`; `AlertDialog` supplies the enhanced presentation. Recheck authorisation and submitted state on confirmation.

Retain existing preview-and-undo or recent-password checks when they already protect the operation. Reversible logo, image and badge changes do not need an extra confirmation step.

## Check layouts

Test empty and long content, light/dark schemes, phone/desktop widths, keyboard use and JavaScript disabled. Use the existing `ui-interactions`, `mobile-nav` and `ui-layout` browser tests.

The UI screenshot suite uses port 3003 and writes to `test-results/ui-polish`. Inspect all shipped themes in both schemes. See [Testing](testing.md) for screenshot commands.
