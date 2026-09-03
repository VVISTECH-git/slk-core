/**
 * The Drizzle schema.
 *
 *   lookup.ts     the controlled vocabulary every record draws on
 *   catalogue.ts  design → colourway → piece → movement
 *   access.ts     actor → actor_token; who is acting, and what lets them
 *   channel.ts    channel → channel_link, reservation, channel_event —
 *                 what apps/sync reads and writes
 */

export * from "./lookup";
export * from "./catalogue";
export * from "./access";
export * from "./channel";
