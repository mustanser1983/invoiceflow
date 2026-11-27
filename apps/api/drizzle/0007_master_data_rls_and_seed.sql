-- 0007_master_data_rls_and_seed: RLS, search indexes and defaults for customers, suppliers,
-- items and expense categories. Needs human review.

GRANT SELECT, INSERT, UPDATE ON customers, suppliers, items, expense_categories TO invoiceflow_app;
--> statement-breakpoint

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON customers FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON suppliers FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON items FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON expense_categories FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint

-- Fuzzy name search per tenant (CUS-007, SUP-007). Needs pg_trgm and btree_gin from 0000_init.
CREATE INDEX customers_name_trgm_idx ON customers USING gin (tenant_id, name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX suppliers_name_trgm_idx ON suppliers USING gin (tenant_id, name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX items_name_trgm_idx ON items USING gin (tenant_id, name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX customers_tenant_email_idx ON customers (tenant_id, email);
--> statement-breakpoint
CREATE INDEX suppliers_tenant_email_idx ON suppliers (tenant_id, email);
--> statement-breakpoint
CREATE INDEX customers_tenant_trn_idx ON customers (tenant_id, tax_registration_number);
--> statement-breakpoint
CREATE INDEX suppliers_tenant_trn_idx ON suppliers (tenant_id, tax_registration_number);
--> statement-breakpoint

CREATE TRIGGER customers_touch_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER suppliers_touch_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER items_touch_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

-- Existing tenants: item numbering and default expense categories (new tenants get them on
-- creation; keep this list in sync with apps/api/src/modules/tenants/tenant-defaults.ts).
INSERT INTO document_sequences (tenant_id, document_type, prefix)
SELECT id, 'item', 'ITM-' FROM tenants
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO expense_categories (tenant_id, name, category_type, is_system)
SELECT t.id, c.name, c.category_type, true
FROM tenants t
CROSS JOIN (VALUES
  ('Rent', 'operating'), ('Utilities', 'operating'), ('Salaries', 'operating'),
  ('Office supplies', 'operating'), ('Travel', 'operating'), ('Fuel', 'operating'),
  ('Telecom', 'operating'), ('Professional fees', 'operating'), ('Marketing', 'operating'),
  ('Bank charges', 'operating'), ('Repairs', 'operating'), ('Cost of goods', 'cost_of_sales'),
  ('Other', 'other')
) AS c(name, category_type)
ON CONFLICT DO NOTHING;
