-- 0000_init: extensions required by DATABASE_ERD.md. No tables yet (Sprint 1).
-- Needs human review before it runs on any shared database.
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email columns
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy name search on customers/suppliers
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint on tax_rates date ranges
CREATE EXTENSION IF NOT EXISTS btree_gin;   -- composite (tenant_id, name) trigram indexes
