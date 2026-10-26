CREATE TABLE "account_profiles" (
	"organization_id" text NOT NULL,
	"software_id" text NOT NULL,
	"avg_monthly_revenue_cents" integer,
	"weekly_hours" numeric(5, 1),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_profiles_organization_id_software_id_pk" PRIMARY KEY("organization_id","software_id")
);
--> statement-breakpoint
ALTER TABLE "impact_settings" ADD COLUMN "default_weekly_hours" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_profiles" ADD CONSTRAINT "account_profiles_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE cascade ON UPDATE no action;