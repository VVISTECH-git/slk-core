/**
 * The Drizzle schema.
 *
 *   lookup.ts     the controlled vocabulary every record draws on
 *   catalogue.ts  design → colourway → piece → movement
 *   access.ts     actor → actor_token; who is acting, and what lets them
 *
 * Still to come:
 *   channel.ts    channel, allocation, listing
 *   sync.ts       sync_event, orders, reconciliation
 */

export * from "./lookup";
export * from "./catalogue";
export * from "./access";
