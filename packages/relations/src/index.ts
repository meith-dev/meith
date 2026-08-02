/**
 * `@forum/relations` — F61.
 *
 * Buddy and ignore lists: one table, one ordered pair per row, and a `kind`
 * that makes the two mutually exclusive by construction.
 *
 * The half worth reading is what *ignoring* does. It withholds a post's body
 * and offers a link to see it anyway; it does not remove the post from the
 * page. Filtering ignored posts out of the query would give every viewer a
 * different page size, make "#12" mean different posts to different people, and
 * land permalinks on the wrong page — which is why F61's acceptance names
 * stable pagination and counts.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next. Whether
 * somebody is staff — the one class of member who cannot be ignored — is the
 * Authorizer's answer, handed in as a boolean (F20).
 */
export {
  MAX_RELATIONS,
  ONLINE_WINDOW_MINUTES,
  RELATION_KINDS,
  isOnline,
  parseRelationKind,
  type RelationKind,
  type RelationRepository,
  type RelationRow,
} from './types'

export { RelationService, suppress } from './service'
