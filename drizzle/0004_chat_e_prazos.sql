CREATE TYPE "public"."chat_kind" AS ENUM('mensagem', 'decisao', 'pendente');--> statement-breakpoint
CREATE TYPE "public"."chat_summary_kind" AS ENUM('arquivo', 'ultimos_dias', 'pendentes');--> statement-breakpoint
ALTER TYPE "public"."alert_module" ADD VALUE 'chat';--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"kind" "chat_kind" DEFAULT 'mensagem' NOT NULL,
	"parent_id" text,
	"roadmap_codes" text[] DEFAULT '{}' NOT NULL,
	"mentions" uuid[] DEFAULT '{}' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"summary_id" integer,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reads" (
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_reads_user_id_channel_pk" PRIMARY KEY("user_id","channel")
);
--> statement-breakpoint
CREATE TABLE "chat_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"kind" "chat_summary_kind" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"content" text NOT NULL,
	"data" jsonb,
	"messages" integer DEFAULT 0 NOT NULL,
	"engine" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roadmap_items" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_channel_time_idx" ON "chat_messages" USING btree ("channel","created_at");--> statement-breakpoint
CREATE INDEX "chat_parent_idx" ON "chat_messages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "chat_summaries_channel_idx" ON "chat_summaries" USING btree ("channel","kind","period_start");