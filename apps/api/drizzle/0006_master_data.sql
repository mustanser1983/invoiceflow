CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_code" text NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" "citext",
	"phone" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tax_registration_number" text,
	"payment_terms_days" smallint DEFAULT 0 NOT NULL,
	"currency_code" text DEFAULT 'AED' NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "customers_tenant_code_key" UNIQUE("tenant_id","customer_code"),
	CONSTRAINT "customers_status_chk" CHECK ("customers"."status" IN ('active','inactive')),
	CONSTRAINT "customers_terms_chk" CHECK ("customers"."payment_terms_days" BETWEEN 0 AND 365),
	CONSTRAINT "customers_currency_chk" CHECK ("customers"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "customers_trn_chk" CHECK ("customers"."tax_registration_number" IS NULL OR "customers"."tax_registration_number" ~ '^[0-9]{15}$')
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category_type" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "expense_categories_tenant_name_key" UNIQUE("tenant_id","name"),
	CONSTRAINT "expense_categories_type_chk" CHECK ("expense_categories"."category_type" IN ('cost_of_sales','operating','other')),
	CONSTRAINT "expense_categories_status_chk" CHECK ("expense_categories"."status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"item_type" text NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"selling_price" numeric(19, 4) DEFAULT '0' NOT NULL,
	"purchase_cost" numeric(19, 4),
	"default_tax_code_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "items_tenant_code_key" UNIQUE("tenant_id","item_code"),
	CONSTRAINT "items_type_chk" CHECK ("items"."item_type" IN ('product','service')),
	CONSTRAINT "items_status_chk" CHECK ("items"."status" IN ('active','inactive')),
	CONSTRAINT "items_selling_price_chk" CHECK ("items"."selling_price" >= 0),
	CONSTRAINT "items_purchase_cost_chk" CHECK ("items"."purchase_cost" IS NULL OR "items"."purchase_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supplier_code" text NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" "citext",
	"phone" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tax_registration_number" text,
	"payment_terms_days" smallint DEFAULT 0 NOT NULL,
	"currency_code" text DEFAULT 'AED' NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "suppliers_tenant_code_key" UNIQUE("tenant_id","supplier_code"),
	CONSTRAINT "suppliers_status_chk" CHECK ("suppliers"."status" IN ('active','inactive')),
	CONSTRAINT "suppliers_terms_chk" CHECK ("suppliers"."payment_terms_days" BETWEEN 0 AND 365),
	CONSTRAINT "suppliers_currency_chk" CHECK ("suppliers"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "suppliers_trn_chk" CHECK ("suppliers"."tax_registration_number" IS NULL OR "suppliers"."tax_registration_number" ~ '^[0-9]{15}$')
);
--> statement-breakpoint
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_type_chk";--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("default_tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_tenant_status_idx" ON "customers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "items_tenant_status_idx" ON "items" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_status_idx" ON "suppliers" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_type_chk" CHECK ("document_sequences"."document_type" IN ('quotation','invoice','credit_note','receipt','purchase_bill','supplier_payment','expense','transfer','customer','supplier','item'));