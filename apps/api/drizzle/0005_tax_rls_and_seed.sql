-- 0005_tax_rls_and_seed: tax RLS and constraints, UAE tax codes, ownership and invitation guards.
-- Needs human review. UAE tax codes are PENDING TAX-ADVISER SIGN-OFF (VAT-009, TAX_RULES_UAE.md).

-- A tax code can't have two rates in force on the same day (needs btree_gist from 0000_init).
ALTER TABLE tax_rates ADD CONSTRAINT tax_rates_no_overlap
  EXCLUDE USING gist (
    tax_code_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  );
--> statement-breakpoint

-- UAE defaults (tenant_id NULL = shared by all UAE tenants). Standard rate 5% from 2018-01-01.
INSERT INTO tax_codes (country_code, code, description, tax_treatment, direction, is_recoverable) VALUES
  ('AE', 'SR',    'Standard rated (5%)',                       'standard',       'both',      true),
  ('AE', 'ZR',    'Zero rated (0%)',                           'zero_rated',     'both',      true),
  ('AE', 'EX',    'Exempt',                                    'exempt',         'both',      false),
  ('AE', 'OS',    'Out of scope',                              'out_of_scope',   'both',      false),
  ('AE', 'SR-NR', 'Standard rated, input VAT not recoverable',  'standard',       'purchases', false),
  ('AE', 'RC',    'Reverse charge (imports of services/goods)', 'reverse_charge', 'purchases', true);
--> statement-breakpoint
INSERT INTO tax_rates (tax_code_id, rate, effective_from)
SELECT id,
       CASE code WHEN 'SR' THEN 5 WHEN 'SR-NR' THEN 5 WHEN 'RC' THEN 5 ELSE 0 END,
       DATE '2018-01-01'
FROM tax_codes WHERE tenant_id IS NULL AND country_code = 'AE';
--> statement-breakpoint

-- Existing tenants get tax settings: not VAT registered, sales out of scope, purchases
-- standard rated but not recoverable (a non-registered business can't reclaim input VAT).
INSERT INTO tenant_tax_settings (tenant_id, default_sales_tax_code_id, default_purchase_tax_code_id)
SELECT t.id,
       (SELECT id FROM tax_codes WHERE tenant_id IS NULL AND country_code = t.country_code AND code = 'OS'),
       (SELECT id FROM tax_codes WHERE tenant_id IS NULL AND country_code = t.country_code AND code = 'SR-NR')
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM tenant_tax_settings s WHERE s.tenant_id = t.id);
--> statement-breakpoint

-- Privileges.
GRANT SELECT, INSERT, UPDATE ON tax_codes, tax_rates, tenant_tax_settings TO invoiceflow_app;
--> statement-breakpoint

-- tax_codes: shared defaults (read-only) and the tenant's own codes.
ALTER TABLE tax_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tax_codes_select ON tax_codes FOR SELECT TO invoiceflow_app
  USING (tenant_id IS NULL OR tenant_id = app.tenant_id());
--> statement-breakpoint
CREATE POLICY tax_codes_write ON tax_codes FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint

-- tax_rates: follow the code's visibility; only the tenant's own codes get new rates.
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tax_rates_select ON tax_rates FOR SELECT TO invoiceflow_app
  USING (EXISTS (SELECT 1 FROM tax_codes c WHERE c.id = tax_code_id));
--> statement-breakpoint
CREATE POLICY tax_rates_write ON tax_rates FOR ALL TO invoiceflow_app
  USING (EXISTS (SELECT 1 FROM tax_codes c WHERE c.id = tax_code_id AND c.tenant_id = app.tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM tax_codes c WHERE c.id = tax_code_id AND c.tenant_id = app.tenant_id()));
--> statement-breakpoint

ALTER TABLE tenant_tax_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_tax_settings FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint
CREATE TRIGGER tenant_tax_settings_touch_updated_at BEFORE UPDATE ON tenant_tax_settings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

-- Every tenant keeps at least one active Owner (S2-10).
CREATE OR REPLACE FUNCTION app.keep_an_owner() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_owner AND OLD.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id = OLD.tenant_id AND m.is_owner AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'A business must keep at least one active owner'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tenant_memberships_last_owner';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.keep_an_owner() TO invoiceflow_app;
--> statement-breakpoint
CREATE TRIGGER tenant_memberships_keep_an_owner
  AFTER UPDATE OF is_owner, status OR DELETE ON tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION app.keep_an_owner();
--> statement-breakpoint

-- One pending invitation per email per tenant.
CREATE UNIQUE INDEX user_invitations_pending_email_key
  ON user_invitations (tenant_id, email) WHERE accepted_at IS NULL;
--> statement-breakpoint

-- Accepting an invitation happens before the user belongs to the tenant, so RLS would hide it.
-- This function returns only the invitation matching an unguessable token hash.
CREATE OR REPLACE FUNCTION app.find_invitation(p_token_hash text)
  RETURNS TABLE (id uuid, tenant_id uuid, email citext, role_id uuid,
                 expires_at timestamptz, accepted_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.tenant_id, i.email, i.role_id, i.expires_at, i.accepted_at
  FROM user_invitations i WHERE i.token_hash = p_token_hash
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.find_invitation(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.find_invitation(text) TO invoiceflow_app;
