/**
 * @forum/search — F72's provider seam and query handling.
 *
 * The SQL lives in `@forum/db`, the screens live in the app, and this package
 * is what they agree on: a query, a scope, and a page of hits. Nothing here
 * knows about `tsquery`, so replacing Postgres full-text search with a hosted
 * index is a new implementation of `SearchProvider` and nothing else.
 */

export {
  MAX_QUERY_LENGTH,
  MIN_TERM_LENGTH,
  isRunnable,
  parseSearchInput,
  type ParsedSearchInput,
} from './query'

export type {
  SearchCursor,
  SearchHit,
  SearchProvider,
  SearchQuery,
  SearchResults,
  SearchScope,
} from './ports'
