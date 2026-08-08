/**
 * The header the proxy uses to tell a page which path it is on (F75).
 *
 * A leaf module with one constant and no imports, because both ends need it and
 * they live on different runtimes: the proxy runs on the Edge, the presence
 * writer in Node. Importing the constant from either side would drag that
 * side's module — and its runtime — into the other.
 *
 * A Server Component cannot ask for its own URL, and threading a path through
 * every page into the shell would mean every page that forgot silently recorded
 * the wrong location. The proxy already has the pathname.
 */
export const PATH_HEADER = 'x-community-path'
