/**
 * How a person likes the app to behave — page size, theme, which screen
 * they land on after signing in. Stored as `actor.preferences`, one
 * flexible jsonb bucket per `packages/db/src/schema/access.ts`'s own
 * reasoning, so a new preference is a code change here, not a migration.
 *
 * Deliberately not per-browser like the grid's own column customization
 * (`lib/column-widths.ts`) — these are meant to follow a person from their
 * desktop to their phone, which is exactly what a jsonb column on their
 * own actor row gives for free.
 */

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Every screen with a "Show N" list — kept here so the Preferences page and every reader agree on the label. */
export const DEFAULT_PAGE_OPTIONS = [
  { value: "/", label: "Dashboard" },
  { value: "/bales", label: "Bale Intake" },
  { value: "/thaans", label: "Stock Records" },
  { value: "/handovers", label: "Handovers" },
  { value: "/outstanding", label: "Currently Out" },
  { value: "/vendors", label: "Vendors" },
  { value: "/vendor-ledger", label: "Vendor Ledger" },
  { value: "/records", label: "Product Management" },
] as const;

export interface Preferences {
  pageSize: PageSize;
  theme: Theme;
  /** A route from `DEFAULT_PAGE_OPTIONS` — where this person lands after signing in. */
  defaultPage: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  pageSize: 50,
  theme: "system",
  defaultPage: "/",
};

/**
 * Turns whatever's in `actor.preferences` into a trustworthy value. Nothing
 * guarantees the jsonb column holds a shape this version of the app still
 * recognizes — an older preference, a hand-edited row — so anything
 * unrecognized falls back to the default rather than being trusted.
 */
export function parsePreferences(raw: unknown): Preferences {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFERENCES;
  const r = raw as Record<string, unknown>;

  const pageSize = (PAGE_SIZES as readonly number[]).includes(r.pageSize as number)
    ? (r.pageSize as PageSize)
    : DEFAULT_PREFERENCES.pageSize;

  const theme = (THEMES as readonly string[]).includes(r.theme as string)
    ? (r.theme as Theme)
    : DEFAULT_PREFERENCES.theme;

  const defaultPage = DEFAULT_PAGE_OPTIONS.some((o) => o.value === r.defaultPage)
    ? (r.defaultPage as string)
    : DEFAULT_PREFERENCES.defaultPage;

  return { pageSize, theme, defaultPage };
}
