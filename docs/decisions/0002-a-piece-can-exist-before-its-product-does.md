# 0002. A piece can exist before its product does

**Status:** Proposed — this captures a change request from the business. Nothing described here is built yet.
**Date:** 2026-09-13

## Context

Product Management asks for a design and a colour before a piece exists. `design`
names what something is — Saree, Kalamkari, Cotton; `colourway` names which
colour it is. A piece is only minted once both are known, at the moment a
consignment is received against that colourway — `piece.colourway_id` is
`NOT NULL` in `packages/db/src/schema/catalogue.ts`, and every path that
creates a piece (`createRecord`, `openConsignment`, the bulk importer) goes
through a colourway to get there. That is the right model for a saree that
arrives from a weaver already finished and already a known SKU.

It is not the model for how Kalamkari is actually made here. A bale of raw
kora cloth arrives with no saree design decided — that gets decided by what
happens to it. The bale is cut into pieces. Each of those pieces needs an
item code and a QR code the moment it is cut, weeks before anyone knows
whether it becomes an Ajrakh cotton saree in indigo or a plain dupatta. From
there each piece travels through a fixed sequence of outside processors —
washing at Salava, dyeing at Karakkaya, block printing, finishing at
Nellateeta and Udukulu, ironing — and at every stage someone at SLK hands it
to a named person and later collects it back. Only once it comes out the far
end does it become a real product with a design, a colour and a price.

The spreadsheet the team runs today (`Cloth Exchanges Final Fixed Sheet.xlsx`)
is this process, worked around the system's absence: one tab per stage
(`Kora to Salava`, `Salava to Karakkaya`, `Karakkaya to Print`,
`Print to Nellateeta`, `Second Print`, `Neelateeta to Udukulu`, `Ironing`,
`Dispatch`), each row naming a bale, a rough item description, and who has
it right now. It is the closest thing that exists to a specification for
what follows.

## The problem with the current schema

Everything in the catalogue schema assumes product identity comes first:

- `piece.colourway_id` is `NOT NULL` — a piece cannot exist without a design
  and colour already chosen.
- `batch` (a consignment) is how stock enters the ledger, and it too hangs
  off `colourway_id`.
- `location.is_internal` distinguishes our warehouses from everywhere stock
  leaves to — a sale, a return, a write-off. It has no concept of "sent out
  for a process and coming back."
- `movement` records a quantity moving between two locations on one of five
  kinds (`received`, `sold`, `damaged`, `returned`, `adjusted`). It has no
  idea of a named person receiving one specific piece, an expected return
  date, or a piece coming back changed — dyed, printed — rather than merely
  relocated.

None of this is wrong for what it was built for. It is answering a different
question — "what do we have to sell" — from the one the production floor is
now asking — "where is this piece, whose hands is it in, and what has been
done to it so far."

## Decision (proposed)

Track a piece's physical life separately from its product identity, and
join the two only when identity becomes known.

New entities, sketched at the level of what they need to answer rather than
as a final column list — this is a starting shape for review, not a schema:

- **`bale`** — a raw material lot. Its own code, the fibre or material it is,
  when and where it was received, from whom. Not a design, not a colourway —
  nothing about the finished saree is known yet.

- **A piece that can exist with no colourway.** Either `piece.colourway_id`
  becomes nullable, or a separate `wip_piece` table holds a piece from the
  moment it is cut until it is assigned a product, with its own item code
  and QR minted at cut time. Which of these two shapes is right is open
  question 1 below — they are not equivalent, and the choice touches every
  query that already assumes a piece has a colourway.

- **A pipeline-stage list** — Kora, Salava, Karakkaya, Print, Nellateeta,
  Udukulu, Ironing, Dispatch — fixed and ordered, unlike the open-ended
  classification lists Master Lists manages today. Whether this is its own
  small table or a `lookup_list` with `is_ordered` set (the mechanism
  Border Height already uses) is open question 2.

- **Job-work partners** — the people and firms doing each stage. Distinct
  from `location`: a partner does work and gives the piece back; a customer
  buys it and does not. Modelling a partner as a new kind of `location`
  (adding a `kind` alongside `is_internal`) reuses the existing
  stock-location machinery; a separate `partner` table keeps two different
  relationships from sharing one column. Open question 5 asks who these
  partners actually are before this gets decided.

- **A handover/collection ledger** — one row per piece per stage: sent by
  whom, to which partner, when; collected by whom, when, in what state. This
  sits beside the existing `movement` ledger rather than inside it —
  `movement` already refuses UPDATE and DELETE by trigger so its counts stay
  explicable, and a job-work event is a different kind of fact (custody, not
  a sale or a stock adjustment) that would strain that guarantee if forced
  into the same table.

- **A "becomes a product" step** — the moment a finished piece is finally
  assigned a design and colourway, at which point it starts appearing
  everywhere Product Management and Stock Records already look. This is the
  seam between the new subsystem and the one that exists today, and it is
  the one place the two must agree on exactly what "a piece" means.

## What does not change

Everything downstream of a piece already having a colourway — Product
Management, Stock Records, the Shopify sync, the record editor, the whole
existing ledger — keeps working exactly as it does today. This is additive:
a new stage in a piece's life *before* the stage the system already models,
not a replacement for it.

## Open questions this doc is not answering

These are judgment calls, not implementation details, and different answers
lead to different schemas. Nothing below should be decided by whoever
happens to write the first migration.

1. **One `piece` table with a nullable `colourway_id`, or two tables
   (`wip_piece` and `piece`) joined by a conversion event?** The first keeps
   one item-code sequence and one QR format for a piece's whole life; the
   second keeps every existing query that assumes `colourway_id is not null`
   untouched, at the cost of a migration step that moves a row from one
   table to the other.

2. **Are the eight pipeline stages fixed forever, or does the business
   expect to add or reorder them?** A hardcoded enum is simpler; a
   `lookup_list` costs nothing extra and already has the ordering this
   needs, but invites treating the pipeline as more freely editable than it
   may actually be.

3. **Can a bale split across more than one final design?** The spreadsheet's
   per-row item description varies row to row for pieces that look like
   they were cut from the same bale, which suggests yes — one bale, many
   eventual products. If so, the bale-to-piece relationship is one-to-many,
   and nothing about a bale should ever be read as implying what its pieces
   become.

4. **What happens to a piece lost or damaged mid-process, at a partner's
   premises rather than SLK's own?** The existing ledger has `damaged`;
   job-work custody has no equivalent yet, and "damaged while out for
   dyeing" is a different fact from "damaged in our own warehouse."

5. **Who are the job-work partners, concretely?** The spreadsheet's Persons
   sheet names individuals (Gangaiah, Naga Malleswar Rao, ...) rather than
   firms. Worth confirming whether tracking is by person, by firm, or both,
   before a `partner` table gets built around the wrong grain.

6. **Is the QR generated once, at the bale cut, and fixed for the piece's
   whole life — or reprinted at each handover?** Bears directly on whether
   `imageKey`-style code minting happens once per piece or once per stage.

## Out of scope for now

Reconciling this against the mobile app, against Shopify listings, and
against the pricing model are all real questions once a piece becomes a
product. None of them are addressed here, because none of them can be
usefully answered until the shape of the WIP tracking itself is settled.

## Next steps

Once the six open questions above have answers, the follow-on work is a
schema design doc naming actual tables and columns, then migrations against
a development database — not production — before anything here touches
`slk-core.vercel.app`.
