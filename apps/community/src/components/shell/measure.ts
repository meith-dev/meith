/**
 * The board's page measure, for the chrome the *app* renders around a theme's
 * slots.
 *
 * ## The seam this exists to name
 *
 * A theme decides how wide a page is — `themes/default` centres its body in
 * `max-w-6xl`, `themes/midnight` could reasonably choose something else. But not
 * everything on a board page comes from a slot: the flash notice above a community
 * listing, the follow control, the thread-order tabs, the poll, and the inline
 * moderation bar are all rendered by the route, because each of them carries a
 * Server Action reference and those never cross the theme contract (D38/D42).
 *
 * Those regions have to line up with the slot they sit above, and there is no
 * field in the contract that tells them what to line up *with*. Until this
 * constant they each carried a bare `px-6`, which meant they ran the full width
 * of the viewport while the listing beneath them was centred — visible as a
 * "Latest · Top rated" strip hanging off the left edge of its own community.
 *
 * So the app states its measure once, here, and the shipped theme agrees with
 * it. **That agreement is a convention, not a guarantee**: a theme that picks a
 * different width will see these strips misalign, and the real fix is a contract
 * that lets a theme declare its measure — which is a later-minor conversation, not a
 * thing to fake with a CSS variable nobody documented.
 *
 * Stated as a constant rather than repeated so that conversation is one edit
 * when it happens, and so a new route cannot quietly invent a seventh width.
 */
export const BOARD_MEASURE = "mx-auto w-full max-w-6xl px-4 sm:px-6"
