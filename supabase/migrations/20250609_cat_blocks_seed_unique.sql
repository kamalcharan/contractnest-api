-- Migration: unique constraint on seeded catalog blocks
-- Prevents duplicate blocks when the same tenant/template is seeded concurrently
-- (two browser tabs, double-click, retry race — all become safe via ON CONFLICT DO NOTHING)
--
-- The unique key is: (tenant_id, resource_template_id, is_live, name)
-- filtered to is_seed = true only — user-created blocks are unconstrained.

CREATE UNIQUE INDEX IF NOT EXISTS ux_cat_blocks_seed_template_env_name
  ON m_cat_blocks (tenant_id, resource_template_id, is_live, name)
  WHERE is_seed = true;
