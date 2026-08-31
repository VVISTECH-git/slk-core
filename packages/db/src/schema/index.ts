/**
 * The Drizzle schema.
 *
 *   lookup.ts     the controlled vocabulary every record draws on
 *   catalogue.ts  design → colourway → piece → movement
 *
 * Still to come:
 *   channel.ts    channel, allocation, listing
 *   sync.ts       sync_event, orders, reconciliation
 *   access.ts     actor, api_key
 */

export * from "./lookup";
export * from "./catalogue";
