/**
 * Schema barrel. Drizzle needs one object containing every table so that
 * `drizzle(client, { schema })` can resolve relations and `drizzle-kit` can
 * diff the whole database in a single pass.
 *
 * Import order is irrelevant to Drizzle but the files themselves have a strict
 * dependency order (identity <- structure <- content), enforced by their
 * imports rather than by convention.
 */

export * from './identity'
export * from './structure'
export * from './content'
export * from './platform'
export * from './messages'
export {
  columnName,
  groupPermissionColumns,
  communityPermissionColumns,
} from './permission-columns'
