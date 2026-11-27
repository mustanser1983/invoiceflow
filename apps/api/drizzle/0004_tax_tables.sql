CREATE TABLE "tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"country_code" text NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"tax_treatment" text NOT NULL,
	"direction" text NOT NULL,
	"is_recoverable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_codes_tenant_country_code_key" UNIQUE NULLS NOT DISTINCT("tenant_id","country_code","code"),
	CONSTRAINT "tax_codes_treatment_chk" CHECK ("tax_codes"."tax_treatment" IN ('standard','zero_rated','exempt','out_of_scope','reverse_charge')),
	CONSTRAINT "tax_codes_direction_chk" CHECK ("tax_codes"."direction" IN ('sales','purchases','both')),
	CONSTRAINT "tax_codes_country_chk" CHECK ("tax_codes"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_code_id" uuid NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	CONSTRAINT "tax_rates_rate_chk" CHECK ("tax_rates"."rate" >= 0 AND "tax_rates"."rate" <= 100),
	CONSTRAINT "tax_rates_range_chk" CHECK ("tax_rates"."effective_to" IS NULL OR "tax_rates"."effective_to" >= "tax_rates"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "tenant_tax_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"is_vat_registered" boolean DEFAULT false NOT NULL,
	"tax_registration_number" text,
	"registration_date" date,
	"reporting_frequency" text DEFAULT 'quarterly' NOT NULL,
	"period_start_month" smallint DEFAULT 1 NOT NULL,
	"default_sales_tax_code_id" uuid,
	"default_purchase_tax_code_id" uuid,
	"prices_include_tax" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_tax_settings_trn_chk" CHECK ("tenant_tax_settings"."tax_registration_number" IS NULL OR "tenant_tax_settings"."tax_registration_number" ~ '^[0-9]{15}$'),
	CONSTRAINT "tenant_tax_settings_registered_chk" CHECK (NOT "tenant_tax_settings"."is_vat_registered" OR "tenant_tax_settings"."tax_registration_number" IS NOT NULL),
	CONSTRAINT "tenant_tax_settings_frequency_chk" CHECK ("tenant_tax_settings"."reporting_frequency" IN ('monthly','quarterly')),
	CONSTRAINT "tenant_tax_settings_period_chk" CHECK ("tenant_tax_settings"."period_start_month" BETWEEN 1 AND 12)
);
--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_tax_settings" ADD CONSTRAINT "tenant_tax_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_tax_settings" ADD CONSTRAINT "tenant_tax_settings_default_sales_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("default_sales_tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_tax_settings" ADD CONSTRAINT "tenant_tax_settings_default_purchase_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("default_purchase_tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tax_rates_code_idx" ON "tax_rates" USING btree ("tax_code_id","effective_from");