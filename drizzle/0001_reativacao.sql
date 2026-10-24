CREATE TYPE "public"."message_channel" AS ENUM('inapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('pendente', 'enviada', 'entregue', 'vista', 'clicada', 'dispensada', 'falhou', 'cancelada', 'bloqueada');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('lembrete', 'dica', 'novidade', 'oferta', 'feedback', 'fim_trial', 'reativacao');--> statement-breakpoint
CREATE TYPE "public"."rule_audience" AS ENUM('todos', 'pagante', 'trial', 'beta');--> statement-breakpoint
CREATE TABLE "engagement_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"software_id" text,
	"inactive_days" integer NOT NULL,
	"audience" "rule_audience" DEFAULT 'todos' NOT NULL,
	"template_id" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"software_id" text,
	"name" text NOT NULL,
	"type" "message_type" NOT NULL,
	"channel" "message_channel" NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"software_id" text NOT NULL,
	"rule_id" integer,
	"template_id" integer,
	"channel" "message_channel" NOT NULL,
	"type" "message_type" NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"status" "message_status" DEFAULT 'pendente' NOT NULL,
	"days_inactive_at_send" integer,
	"error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "email_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "inapp_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "unsubscribe_token" text;--> statement-breakpoint
ALTER TABLE "engagement_rules" ADD CONSTRAINT "engagement_rules_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_rules" ADD CONSTRAINT "engagement_rules_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_software_id_softwares_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."softwares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_rule_id_engagement_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."engagement_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_person_idx" ON "outbound_messages" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "outbound_rule_idx" ON "outbound_messages" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "persons_last_seen_idx" ON "persons" USING btree ("last_seen_at");--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_unsubscribe_token_unique" UNIQUE("unsubscribe_token");