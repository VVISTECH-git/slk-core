-- The QR label gets stitched onto a Thaan by the Master as soon as it's
-- cut and coded — a real stage in the pipeline, and the first one: it
-- happens before Salava, not after Ironing. See the updated STAGES order
-- in apps/web/src/lib/stages.ts, which is what actually enforces the
-- sequence; these constraints only guard against a typo'd stage name.

ALTER TABLE "vendor_rate" DROP CONSTRAINT "vendor_rate_stage_known";--> statement-breakpoint
ALTER TABLE "vendor_rate" ADD CONSTRAINT "vendor_rate_stage_known"
  CHECK ("vendor_rate"."stage" in (
    'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
  ));--> statement-breakpoint

ALTER TABLE "vendor_transaction" DROP CONSTRAINT "vendor_transaction_stage_known";--> statement-breakpoint
ALTER TABLE "vendor_transaction" ADD CONSTRAINT "vendor_transaction_stage_known"
  CHECK ("vendor_transaction"."stage" in (
    'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
  ));--> statement-breakpoint

ALTER TABLE "handover" DROP CONSTRAINT "handover_stage_known";--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_stage_known"
  CHECK ("handover"."stage" in (
    'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
  ));
