/**
 * `@meith/profile-fields` — F59.
 *
 * Custom profile fields: typed, ordered, per-group visible and editable, and
 * optionally asked at registration. F57 gave a member three fields the board
 * decided on; this hands the same idea to the operator.
 *
 * The per-group half is shaped exactly like F21's `community_permissions` —
 * nullable rules that inherit a default, combined by R4.2's "any grant is a
 * grant". Reusing that shape is the point: "who can see this" means one thing
 * everywhere on this board.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next, no driver
 * implementations — and no group ids, which only `@meith/authorization` may
 * reason about (F20). The rules that apply to an actor are filtered *there* and
 * handed here as data.
 */
export {
  FIELD_TYPES,
  DEFAULT_MAX_LENGTH,
  parseFieldType,
  type FieldType,
  type ProfileFieldDefinition,
  type ProfileFieldGroupRule,
  type ProfileFieldRepository,
  type ProfileFieldValue,
  type ResolvedProfileField,
} from './types'

export {
  editableFields,
  maxLengthFor,
  resolveAccess,
  visibleFields,
  type FieldAccess,
} from './resolve'

export { ProfileFieldService, type ProfileFieldContext } from './service'
