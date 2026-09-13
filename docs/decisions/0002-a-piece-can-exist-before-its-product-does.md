# 0002. A piece can exist before its product does

**Status:** Proposed — this captures a change request from the business, refined
across a working session that answered most of the questions the first draft
of this doc left open. Still nothing described here is built.
**Date:** 2026-09-13, revised same day after the working session below.

## Context

Product Management asks for a design and a colour before a piece exists.
`design` names what something is — Saree, Kalamkari, Cotton; `colourway`
names which colour it is. A piece is only minted once both are known, at the
moment a consignment is received against that colourway — `piece.colourway_id`
is `NOT NULL` in `packages/db/src/schema/catalogue.ts`, and every path that
creates a piece (`createRecord`, `openConsignment`, the bulk importer) goes
through a colourway to get there. That is the right model for a saree that
arrives from a weaver already finished and already a known SKU.

It is not the model for how Kalamkari is actually made here. A bale of raw
kora cloth arrives with no saree design decided — that gets decided by what
happens to it. The bale is cut into pieces. Each of those pieces needs an
item code and a QR code the moment it is cut, weeks before anyone knows
whether it becomes an Ajrakh cotton saree in indigo or a plain dupatta. From
there each piece travels through a sequence of processes — some done by
outside vendors, some in-house — and at every handoff someone hands it over
and later collects it back. Only once it comes out the far end does it
become a real product with a design, a colour and a price.

The spreadsheet the team runs today (`Cloth Exchanges Final Fixed Sheet.xlsx`)
is this process, worked around the system's absence: one tab per stage
(`Kora to Salava`, `Salava to Karakkaya`, `Karakkaya to Print`,
`Print to Nellateeta`, `Second Print`, `Neelateeta to Udukulu`, `Ironing`,
`Dispatch`), each row naming a bale, a rough item description, and who has
it right now. Reading that sheet's columns and validation rules answered
some questions; the rest came directly from the business in the working
session this revision is built on.

## The process, as confirmed

**Intake.** Kora cloth is received from a supplier, delivered by a
transport service, against a paper invoice. The entry made at this point
records the supplier, the transporter, the invoice (bill number and bill
date), the total length received in metres, a rough item/type description,
and how many physical bales the entry covers. This matches the
`Bales Data` sheet's own columns almost exactly (`Supplier Name`, `Bill No`,
`Bill Date`, `Item Name`, `Qty`/`UoM`, `No. of Bales`) and there is no
reason to depart from that shape.

**Cutting.** A bale is cut into pieces the trade calls **Thaans** — this
was `Ghana` in an earlier pass at this doc, which was a mishearing; it is
Thaan throughout, and it is already in the sheet's own vocabulary
(`Cotton Chunni Thaans`, `Per Thaan Mtr`). Cutting is not necessarily one
sitting: a bale can be half-cut today and half-cut tomorrow, sitting in a
genuinely partial state in between — which is exactly what the sheet's
`Bale status` column (`Bale Cutting Done` / `Bale Cutting going on` /
`Bale Cutting not Started`) already tracks. Whatever a session actually
cuts, entered as a whole at the end of that session, becomes a batch of
individually created Thaans — for example, twelve pieces cut in one sitting
are entered as twelve at once, not one at a time as the scissors move.

**QR, minted once, kept for life — unless the piece is split.** Every
Thaan gets its own QR the moment it is created, and it is stitched onto the
cloth immediately — there is no gap between minting and attaching worth
tracking as a state of its own. That QR is meant to stay with the piece
through the whole pipeline and onto the shelf: the code on the label at
cutting time is the same code on the label when the finished saree is
photographed and shelved. The one exception is a genuine physical split —
a Thaan turns out to hold cloth for two sarees rather than one, gets cut in
two once that is known, and each half becomes its own new piece with its
own new QR, tracing back to the Thaan it came from. Cutting a bale into
Thaans and later cutting a Thaan into finished pieces are the same
operation happening at two different points in a piece's life: take one
existing piece, produce however many new pieces come out of it, mint a
fresh QR for each, and keep the lineage. **The exact rule for when that
split happens is deliberately left for a later pass** — see Open Questions.

**Handover and collection are scan events, for accountability.** The whole
point of putting a QR on a piece is to make it provable who has it: a
person scans a piece out when it is handed to wherever it is going next,
and scans it back in when it is collected. This has to work at volume — a
single session can be 300 pieces scanned one after another — so the
screen this implies is: choose the destination first, then scan piece
after piece into a running list with a visible count and a way to correct
a mis-scan, then submit the whole batch as one event. It is not a form
filled in once per piece.

**A handover is scoped to one vendor and one process.** A batch going out
names a single destination (one vendor, or SLK's own team) doing a single
process — a session does not mix "off to Karakkaya" with "off to Print" in
the same scan. Product type does not matter for this grouping: saree
Thaans and chunni Thaans can travel in the same handover as long as they
are all actually due for that same next process.

**Every piece is checked individually, against its own history, before it
is allowed into a handover.** A piece must complete the pipeline's stages
in the order they actually happen — it cannot be sent to Karakkaya before
it has been collected back from Salava. Different pieces sit at different
points in the pipeline at the same time as a matter of course; nothing
about one piece's progress blocks another's. What a handover screen has to
check, per piece scanned into it, is: has this specific piece actually
finished the stage that has to come immediately before the one this
handover is for?

**Any stage can be done in-house or sent to a vendor — including
printing.** Nothing in the pipeline is fixed to always being outsourced or
always being internal; that is decided case by case. Vendors themselves
are individual people, not registered firms, and the same person can be
the vendor for more than one stage — which is why the same handful of
names show up against more than one stage in the sheet today. Whichever
way a given handover goes, an SLK staff member is always the one recorded
as having performed it.

**A vendor is liable for a piece lost or damaged in their custody, and the
system needs to track the charge** — not just flag that it happened, but
carry an actual amount against that vendor, which implies some running
total of what each vendor has been charged is worth keeping, even if
nothing here yet says how that amount gets settled.

**The product-conversion moment is after Ironing:** photos are taken and
the piece goes onto the shelf. That is the point a Thaan-turned-saree
stops being tracked only by its place in the pipeline and starts being a
real product — this is exactly the Images tab and stock-receipt flow that
already exist in Product Management today, and there is no reason to
build a second version of either. What changes is only that the piece
already has its QR and its item code from cutting time; nothing new is
minted here, a design and colourway simply get attached to a piece that
already exists.

## What this means for the schema (proposed, not final)

- **One `piece` table, with `colourway_id` made nullable**, rather than a
  separate WIP table joined by a conversion step. The "same QR forever"
  rule settles this: if the identifier never changes, there is nothing to
  convert between two different records — a piece born at cutting time and
  a piece on the shelf are literally the same row, with fields filled in as
  they become known.
- **A `bale` entity**, holding intake's own fields: supplier, transporter,
  invoice number and date, metres received, item/type description, number
  of bales, and a cutting-progress status.
- **A general "split" event**, not specific to cutting a bale: takes one
  piece, produces N new pieces each with a fresh QR, and records which
  piece they came from. Bale-to-Thaan and Thaan-to-finished-piece both go
  through this same mechanism.
- **A pipeline-stage list** — Kora, Salava, Karakkaya, Print,
  (optionally Second Print), Nellateeta, Udukulu, Ironing, Dispatch — kept
  in the order pieces actually move through them.
- **A handover/collection ledger**, scoped to one vendor-or-internal-team
  and one stage per event: which pieces, sent by which SLK staff member, to
  whom, when; collected by whom, when. Validated per piece against the
  stage sequence at the moment it is scanned in.
- **Vendor liability**, recording a charge against a specific vendor when a
  piece is lost or damaged in their custody, and some way of totalling
  what a given vendor has been charged.
- **Something distinguishing "vendor" from "SLK's own operations team"** at
  the point a handover names who is doing the work, since either is valid
  for any stage.

None of this touches how a piece behaves once it has a colourway — Product
Management, Stock Records, the Shopify sync, the existing ledger, all keep
working exactly as they do today. This is additive: stages in a piece's
life *before* the stage the system already models.

## Open questions

1. **Exactly when does a Thaan get split into more than one finished
   piece, and who decides it?** Confirmed that it happens and that each
   resulting piece needs its own new QR; the actual trigger and the
   decision-maker are deliberately deferred to a later pass.
2. **Does the pipeline's stage list need to stay editable**, or are the
   eight stages fixed for the foreseeable future? Not yet asked directly;
   low-cost to leave as a `lookup_list` either way, so not blocking.
3. **How is the charge against a liable vendor actually computed** — a
   fixed amount, the piece's estimated value, something the staff member
   enters by hand at the time? Confirmed only that it must be tracked, not
   how.

## Out of scope for now

Reconciling this against the mobile app, against Shopify listings, and
against the pricing model are all real questions once a piece becomes a
product. None of them are addressed here, because none of them can be
usefully answered until the shape of the WIP tracking itself is settled.

## Next steps

This remains a living document — expect it to keep changing as more of the
business's own rules get added. Once the open questions above have answers
and no major rule is still missing, the follow-on work is a schema design
naming actual tables and columns, then migrations against a development
database — not production — before anything here touches
`slk-core.vercel.app`.
