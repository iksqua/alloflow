ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS network_status text NOT NULL DEFAULT 'not_shared'
  CHECK (network_status IN ('active', 'inactive', 'coming_soon', 'not_shared')),
  ADD COLUMN IF NOT EXISTS sop_required boolean NOT NULL DEFAULT false;
