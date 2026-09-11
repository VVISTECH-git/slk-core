/**
 * The role hierarchy, on its own — no DB import, so a client component
 * (the record editor, gating which approval buttons it renders) can import
 * this directly instead of pulling in `auth.ts`'s Postgres driver.
 *
 * `auth.ts` re-exports all of this, so every existing server-side import
 * keeps working unchanged; this file exists only to give the client half of
 * the app somewhere safe to import the same definition from.
 */

/** Roles, weakest first. A check asks for a floor and accepts an owner. */
export const ROLE_RANK = { floor: 0, office: 1, owner: 2 } as const;

export type Role = keyof typeof ROLE_RANK;

export function isRole(value: string): value is Role {
  return value in ROLE_RANK;
}

export function allows(role: string, needed: Role): boolean {
  return isRole(role) && ROLE_RANK[role] >= ROLE_RANK[needed];
}
