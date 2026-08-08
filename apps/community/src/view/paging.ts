/**
 * Page sizes, in one place.
 *
 * They were constants inside their own route files until F40 needed one from
 * outside a page: the reply redirect has to know whether a new post lands on
 * the first page. A page size that two files disagree about sends people to the
 * wrong page, which is exactly the kind of bug nobody reports precisely.
 */
export const THREADS_PER_PAGE = 25
export const POSTS_PER_PAGE = 20
