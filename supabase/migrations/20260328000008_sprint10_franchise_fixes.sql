-- Sprint 10: Franchise infrastructure — follow-up fixes
-- These changes correct migration 20260328000007 which was already applied.

-- 1. Ensure organizations.type is NOT NULL (may already be not null if column was defined that way)
alter table public.organizations alter column type set not null;

-- 2. Performance indexes
create index if not exists idx_organizations_parent_org_id on public.organizations(parent_org_id);
create index if not exists idx_franchise_contracts_org_id on public.franchise_contracts(org_id);
create index if not exists idx_franchise_contracts_establishment_id on public.franchise_contracts(establishment_id);
