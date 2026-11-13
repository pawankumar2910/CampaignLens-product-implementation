CREATE TYPE "public"."member_role" AS ENUM('owner', 'analyst', 'viewer');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"demo_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"channel" text,
	"campaign" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"channel" text NOT NULL,
	"campaign" text NOT NULL,
	"spend_cents" bigint NOT NULL,
	"impressions" bigint NOT NULL,
	"clicks" bigint NOT NULL,
	"conversions" numeric(16, 4) NOT NULL,
	"revenue_cents" bigint NOT NULL,
	"import_id" uuid
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"conversion_definition" text DEFAULT '' NOT NULL,
	"branding" jsonb NOT NULL,
	"thresholds" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"source" text NOT NULL,
	"file_hash" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"conflict_policy" text NOT NULL,
	"rows_in_file" integer NOT NULL,
	"inserted" integer NOT NULL,
	"replaced" integer NOT NULL,
	"unchanged" integer NOT NULL,
	"kept_existing" integer NOT NULL,
	"rejected" integer NOT NULL,
	"error_count" integer NOT NULL,
	"warning_count" integer NOT NULL,
	"issues" jsonb NOT NULL,
	"coverage_start" date,
	"coverage_end" date,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"created_by" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"commentary" text DEFAULT '' NOT NULL,
	"sections" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_days" ADD CONSTRAINT "campaign_days_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_days" ADD CONSTRAINT "campaign_days_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_days" ADD CONSTRAINT "campaign_days_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "budgets_client_idx" ON "budgets" USING btree ("client_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_days_grain_uq" ON "campaign_days" USING btree ("client_id","date","channel","campaign");--> statement-breakpoint
CREATE INDEX "campaign_days_agency_idx" ON "campaign_days" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_agency_name_uq" ON "clients" USING btree ("agency_id","name");--> statement-breakpoint
CREATE INDEX "imports_client_idx" ON "imports" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "invitations_agency_idx" ON "invitations" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_agency_user_uq" ON "memberships" USING btree ("agency_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_client_idx" ON "reports" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_links_report_idx" ON "share_links" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");