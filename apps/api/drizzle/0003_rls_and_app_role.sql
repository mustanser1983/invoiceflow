-- 0003_rls_and_app_role: the API's database role and row-level security (DATABASE_ERD.md §2).
-- Needs human review.
--
-- How it works
-- * Migrations run as the owner role. The API connects with a login role that is a member of
--   invoiceflow_app and, in every transaction, runs SET LOCAL ROLE invoiceflow_app and sets
--   app.tenant_id / app.user_id / app.auth_subject with set_config(..., true). Everything is
--   transaction-local, so pooled connections never carry context between requests.
-- * invoiceflow_app is NOBYPASSRLS and does not own the tables, so RLS always applies to it.
-- * Tables use ENABLE (not FORCE) RLS so the owner can run migrations and seeds. Production must
--   therefore connect with a non-owner login role (see DATABASE_ERD.md §1.1).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'invoiceflow_app') THEN
    CREATE ROLE invoiceflow_app NOLOGIN NOBYPASSRLS;
  END IF;
  -- Let the migrating/login role switch into invoiceflow_app. On PostgreSQL 16+ the creator of a
  -- role gets ADMIN on it but not SET, so grant SET explicitly (also correct on re-runs).
  IF NOT pg_has_role(current_user, 'invoiceflow_app', 'SET') THEN
    EXECUTE format('GRANT invoiceflow_app TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  END IF;
END
$$;
--> statement-breakpoint

-- Context helpers. NULLIF handles the empty string a reset custom setting returns.
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.auth_subject() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.auth_subject', true), '') $$;
--> statement-breakpoint

-- Privileges. Least privilege per table; audit_logs is append-only.
GRANT USAGE ON SCHEMA public, app TO invoiceflow_app;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO invoiceflow_app;
--> statement-breakpoint
GRANT SELECT ON permissions TO invoiceflow_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tenants, users TO invoiceflow_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  roles, role_permissions, tenant_memberships, user_invitations,
  tenant_settings, document_sequences, idempotency_keys
TO invoiceflow_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO invoiceflow_app;
--> statement-breakpoint

-- tenants: the current tenant, plus tenants the current user belongs to (tenant switcher).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenants_select ON tenants FOR SELECT TO invoiceflow_app
  USING (
    id = app.tenant_id()
    OR id IN (SELECT m.tenant_id FROM tenant_memberships m
              WHERE m.user_id = app.user_id() AND m.status = 'active')
  );
--> statement-breakpoint
CREATE POLICY tenants_insert ON tenants FOR INSERT TO invoiceflow_app
  WITH CHECK (id = app.tenant_id());
--> statement-breakpoint
CREATE POLICY tenants_update ON tenants FOR UPDATE TO invoiceflow_app
  USING (id = app.tenant_id()) WITH CHECK (id = app.tenant_id());
--> statement-breakpoint

-- users: yourself, the identity being signed in, and members of the current tenant.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_select ON users FOR SELECT TO invoiceflow_app
  USING (
    id = app.user_id()
    OR auth_provider || ':' || auth_provider_id = app.auth_subject()
    OR id IN (SELECT m.user_id FROM tenant_memberships m WHERE m.tenant_id = app.tenant_id())
  );
--> statement-breakpoint
CREATE POLICY users_insert ON users FOR INSERT TO invoiceflow_app
  WITH CHECK (auth_provider || ':' || auth_provider_id = app.auth_subject());
--> statement-breakpoint
CREATE POLICY users_update ON users FOR UPDATE TO invoiceflow_app
  USING (id = app.user_id()) WITH CHECK (id = app.user_id());
--> statement-breakpoint

-- roles: system templates (read-only), the current tenant's custom roles, and the roles the
-- current user holds in other tenants (so the tenant switcher can show them).
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY roles_select ON roles FOR SELECT TO invoiceflow_app
  USING (
    tenant_id IS NULL
    OR tenant_id = app.tenant_id()
    OR id IN (SELECT m.role_id FROM tenant_memberships m
              WHERE m.user_id = app.user_id() AND m.status = 'active')
  );
--> statement-breakpoint
CREATE POLICY roles_write ON roles FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint

-- role_permissions: follow the visibility of the role; only the tenant's own roles are writable.
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY role_permissions_select ON role_permissions FOR SELECT TO invoiceflow_app
  USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id));
--> statement-breakpoint
CREATE POLICY role_permissions_write ON role_permissions FOR ALL TO invoiceflow_app
  USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND r.tenant_id = app.tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND r.tenant_id = app.tenant_id()));
--> statement-breakpoint

-- tenant_memberships: the current tenant's members, plus your own memberships everywhere.
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_memberships_select ON tenant_memberships FOR SELECT TO invoiceflow_app
  USING (tenant_id = app.tenant_id() OR user_id = app.user_id());
--> statement-breakpoint
CREATE POLICY tenant_memberships_write ON tenant_memberships FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint

-- Plain tenant isolation.
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON user_invitations FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_settings FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON document_sequences FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON idempotency_keys FOR ALL TO invoiceflow_app
  USING (tenant_id = app.tenant_id()) WITH CHECK (tenant_id = app.tenant_id());
--> statement-breakpoint

-- audit_logs: read the current tenant's events; write tenant events or tenant-less user events.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO invoiceflow_app
  USING (tenant_id = app.tenant_id());
--> statement-breakpoint
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO invoiceflow_app
  WITH CHECK (tenant_id IS NULL OR tenant_id = app.tenant_id());
--> statement-breakpoint

-- A membership's role must be a system role or one of the same tenant's roles.
CREATE OR REPLACE FUNCTION app.check_membership_role() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id = NEW.role_id AND (r.tenant_id IS NULL OR r.tenant_id = NEW.tenant_id)
  ) THEN
    RAISE EXCEPTION 'role % is not available to tenant %', NEW.role_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tenant_memberships_role_check
  BEFORE INSERT OR UPDATE OF role_id, tenant_id ON tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION app.check_membership_role();
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.check_membership_role() TO invoiceflow_app;
--> statement-breakpoint

-- Keep updated_at current.
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.touch_updated_at() TO invoiceflow_app;
--> statement-breakpoint
CREATE TRIGGER tenants_touch_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER tenant_settings_touch_updated_at BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
