ALTER TABLE "handover" ADD COLUMN "through_stage" text;--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_through_stage_known" CHECK ("handover"."through_stage" is null or "handover"."through_stage" in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      ));