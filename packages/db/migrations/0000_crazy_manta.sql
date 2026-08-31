CREATE TABLE "lookup_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"lowercase_values" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookup_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"parent_value_id" uuid,
	"is_proposed" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lookup_value" ADD CONSTRAINT "lookup_value_list_id_lookup_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lookup_list"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookup_value" ADD CONSTRAINT "lookup_value_parent_value_id_lookup_value_id_fk" FOREIGN KEY ("parent_value_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lookup_list_code_key" ON "lookup_list" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "lookup_value_list_code_key" ON "lookup_value" USING btree ("list_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "lookup_value_list_label_key" ON "lookup_value" USING btree ("list_id","label");--> statement-breakpoint
CREATE INDEX "lookup_value_list_sort_idx" ON "lookup_value" USING btree ("list_id","sort_order");--> statement-breakpoint
CREATE INDEX "lookup_value_parent_idx" ON "lookup_value" USING btree ("parent_value_id");