/**
 * The Drizzle schema.
 *
 * The lookup master is here because it is fully specified — see
 * docs/controlled-vocabulary.html in the workspace root.
 *
 * The stock tables are not, and are deliberately absent. Their columns depend
 * on how SLK actually manufactures and sells, which is still being settled;
 * guessing produces a schema that has to be migrated away from later, on top
 * of real stock.
 *
 * Still to come:
 *   catalogue.ts   design, colourway, piece, location
 *   movement.ts    the ledger
 *   channel.ts     channel, allocation, listing
 *   sync.ts        sync_event, orders, reconciliation
 *   access.ts      actor, api_key
 */

export * from "./lookup";
