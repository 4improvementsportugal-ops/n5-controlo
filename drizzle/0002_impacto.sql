ALTER TYPE "public"."alert_module" ADD VALUE 'impacto';--> statement-breakpoint
CREATE TABLE "impact_settings" (
	"software_id" text PRIMARY KEY NOT NULL,
	"hour_value_cents" integer DEFAULT 2000 NOT NULL,
	"fast_response_minutes" integer DEFAULT 5 NOT NULL,
	"min_sample" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"software_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"manual_minutes" numeric(8, 2) NOT NULL,
	"remaining_minutes" numeric(8, 2) DEFAULT '0' NOT NULL,
	"basis" text,
	"validated" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "impact_settings" ADD CONSTRAINT "impact_settings_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_tasks" ADD CONSTRAINT "impact_tasks_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "impact_tasks_sw_key" ON "impact_tasks" USING btree ("software_id","key");