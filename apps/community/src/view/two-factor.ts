/**
 * The form-state key the fresh recovery codes travel back under. It lives here
 * rather than beside the action because a `'use server'` module may export
 * nothing but async functions, and the client component needs to read it.
 */
export const RECOVERY_CODES_FIELD = 'recoveryCodes'
