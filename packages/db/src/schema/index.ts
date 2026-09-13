/**
 * The Drizzle schema.
 *
 *   lookup.ts     the controlled vocabulary every record draws on
 *   catalogue.ts  design → colourway → piece → movement
 *   access.ts     actor → actor_token; who is acting, and what lets them
 *   channel.ts    channel → channel_link, reservation, channel_event —
 *                 what apps/sync reads and writes
 *   review.ts     the editorial approval trail behind colourway.reviewStatus
 *   production.ts Kora to Shelf — bale intake onward, deliberately
 *                 independent of catalogue.ts; see that file's own comment
 */

export * from "./lookup";
export * from "./catalogue";
export * from "./access";
export * from "./channel";
export * from "./review";
export * from "./production";
