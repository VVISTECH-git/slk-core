/**
 * The Drizzle schema.
 *
 * Deliberately empty. The table design is settled in principle — an
 * append-only movement ledger with counts derived from it — but the columns
 * depend on how SLK actually manufactures and sells, which is a conversation
 * still to have. Guessing here produces a schema that has to be migrated away
 * from later, on top of real stock.
 *
 * When tables arrive they go in sibling files and are re-exported here, so
 * `drizzle.config.ts` and the client both see one surface:
 *
 *   catalogue.ts   design, piece, location
 *   movement.ts    the ledger, plus its immutability trigger's companion types
 *   channel.ts     channel, allocation, listing
 *   sync.ts        sync_event, orders, reconciliation
 *   access.ts      actor, api_key
 */

export {};
