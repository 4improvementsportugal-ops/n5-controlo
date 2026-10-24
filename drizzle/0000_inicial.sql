CREATE TYPE "public"."alert_module" AS ENUM('comunidades', 'pipeline', 'campanhas', 'receita', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('critico', 'aviso', 'informacao');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('novo', 'visto', 'resolvido');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('recebido', 'em_analise', 'planeado', 'em_desenvolvimento', 'lancado', 'recusado', 'duplicado');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('sugestao', 'bug', 'funciona_bem', 'funciona_mal');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('agencia', 'eni', 'particular');--> statement-breakpoint
CREATE TYPE "public"."person_origin" AS ENUM('pagante', 'beta', 'trial');--> statement-breakpoint
CREATE TYPE "public"."roadmap_origin" AS ENUM('comunidade', 'equipa', 'cliente', 'incidente');--> statement-breakpoint
CREATE TYPE "public"."roadmap_phase" AS ENUM('ideia', 'descoberta', 'design', 'desenvolvimento', 'testes', 'staging', 'producao');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critico', 'alto', 'medio', 'baixo');--> statement-breakpoint
CREATE TYPE "public"."software_status" AS ENUM('em_construcao', 'beta', 'lancado', 'pausado');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('socio', 'direcao_operacoes', 'colaborador');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"module" "alert_module" NOT NULL,
	"software_id" text,
	"severity" "alert_severity" NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"dedupe_key" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"status" "alert_status" DEFAULT 'novo' NOT NULL,
	"owner_user_id" uuid,
	"note" text,
	"muted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"software_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"software_id" text NOT NULL,
	"account_id" text,
	"campaign_id" text NOT NULL,
	"campaign_name" text NOT NULL,
	"adset_name" text DEFAULT '' NOT NULL,
	"ad_name" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"frequency" numeric(6, 2)
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"software_id" text,
	"repo" text NOT NULL,
	"environment" text NOT NULL,
	"status" text NOT NULL,
	"sha" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"software_id" text NOT NULL,
	"type" "feedback_type" NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"author_name" text,
	"author_slack_id" text,
	"author_person_id" text,
	"origin" "person_origin",
	"feature" text,
	"severity" "severity",
	"votes" integer DEFAULT 1 NOT NULL,
	"status" "feedback_status" DEFAULT 'recebido' NOT NULL,
	"owner_user_id" uuid,
	"refusal_reason" text,
	"roadmap_item_id" integer,
	"duplicate_of_id" text,
	"slack_channel" text,
	"slack_ts" text,
	"first_response_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"software_id" text,
	"amount_cents" integer NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"certified_number" text,
	"issued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mrr_monthly" (
	"organization_id" text NOT NULL,
	"software_id" text NOT NULL,
	"month" text NOT NULL,
	"mrr_cents" integer NOT NULL,
	CONSTRAINT "mrr_monthly_organization_id_software_id_month_pk" PRIMARY KEY("organization_id","software_id","month")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "org_type" DEFAULT 'particular' NOT NULL,
	"nif" text,
	"stripe_customer_id" text,
	"platform_client_id" text,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"email" text,
	"name" text,
	"origin" "person_origin" DEFAULT 'trial' NOT NULL,
	"slack_user_id" text,
	"attribution" jsonb,
	"signed_up_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"software_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" text PRIMARY KEY NOT NULL,
	"software_id" text NOT NULL,
	"name" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"person_id" text,
	"organization_id" text,
	"session_id" text,
	"feature" text,
	"properties" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_costs" (
	"software_id" text NOT NULL,
	"month" text NOT NULL,
	"provider" text NOT NULL,
	"cost_cents" integer NOT NULL,
	CONSTRAINT "provider_costs_software_id_month_provider_pk" PRIMARY KEY("software_id","month","provider")
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"roadmap_item_id" integer,
	"software_id" text,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"is_agent" boolean DEFAULT false NOT NULL,
	"state" text NOT NULL,
	"url" text,
	"first_commit_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"software_id" text NOT NULL,
	"version" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"slack_posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"software_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"origin" "roadmap_origin" DEFAULT 'equipa' NOT NULL,
	"phase" "roadmap_phase" DEFAULT 'ideia' NOT NULL,
	"impact" integer DEFAULT 1 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"effort" integer DEFAULT 1 NOT NULL,
	"owner_user_id" uuid,
	"agent" boolean DEFAULT false NOT NULL,
	"acceptance_criteria" text,
	"product_events" text[] DEFAULT '{}' NOT NULL,
	"sprint" text,
	"version" text,
	"phase_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "softwares" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"status" "software_status" DEFAULT 'em_construcao' NOT NULL,
	"meta_ad_account_id" text,
	"meta_pixel_id" text,
	"github_repos" text[] DEFAULT '{}' NOT NULL,
	"slack_prefix" text,
	"activation_definition" text,
	"key_events" text[] DEFAULT '{}' NOT NULL,
	"cpl_limit_cents" integer,
	"cost_per_account_limit_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "softwares_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"software_id" text NOT NULL,
	"plan" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"mrr_cents" integer DEFAULT 0 NOT NULL,
	"included_minutes" integer DEFAULT 0 NOT NULL,
	"included_leads" integer DEFAULT 0 NOT NULL,
	"extra_limit_cents" integer,
	"trial_end" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"software_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"person_id" text,
	"unit" text NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"cost_usd" numeric(14, 6) NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"billable" boolean DEFAULT true NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_softwares" (
	"user_id" uuid NOT NULL,
	"software_id" text NOT NULL,
	CONSTRAINT "user_softwares_user_id_software_id_pk" PRIMARY KEY("user_id","software_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "team_role" DEFAULT 'colaborador' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"body" text NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_daily" ADD CONSTRAINT "campaign_daily_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_softwares" ADD CONSTRAINT "user_softwares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_softwares" ADD CONSTRAINT "user_softwares_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_daily_uniq" ON "campaign_daily" USING btree ("campaign_id","adset_name","ad_name","date");--> statement-breakpoint
CREATE INDEX "feedback_sw_status_idx" ON "feedback" USING btree ("software_id","status");--> statement-breakpoint
CREATE INDEX "persons_org_idx" ON "persons" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "events_sw_time_idx" ON "product_events" USING btree ("software_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_person_idx" ON "product_events" USING btree ("person_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_sw_version" ON "releases" USING btree ("software_id","version");--> statement-breakpoint
CREATE INDEX "subs_org_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subs_sw_idx" ON "subscriptions" USING btree ("software_id");--> statement-breakpoint
CREATE INDEX "usage_org_time_idx" ON "usage_records" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_sw_time_idx" ON "usage_records" USING btree ("software_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_ext" ON "webhook_inbox" USING btree ("source","external_id");