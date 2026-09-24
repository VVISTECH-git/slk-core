/**
 * Paging numbers for Stock Records, kept apart from lib/thaans.ts because
 * the grid runs in the browser and that module talks to the database.
 */

/** Rows per page when the visit does not say — the pager asks the database for each page, so every Thaan is reachable by paging as well as by typing. */
export const THAAN_LIMIT = 100;
export const PER_PAGE_MIN = 10;
export const PER_PAGE_MAX = 500;
