-- Migration: Create m_facility_hierarchy_templates table
-- Description: Global master table for industry-standard facility hierarchy structures.
--              Used by seedTenantOnIndustryConfirmed (buyer path) to create
--              placeholder facility nodes for a new buyer tenant.
-- Date: 2026-05-15

-- ============================================================================
-- CREATE TABLE: m_facility_hierarchy_templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."m_facility_hierarchy_templates" (
    "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Industry this template belongs to (soft ref to m_catalog_industries)
    "industry_id"          VARCHAR(50) NOT NULL,

    -- Hierarchy level (1 = top/root, ascending downward)
    "level"                INTEGER NOT NULL,

    -- Internal type key — used as the value in allowed_parent_types
    "entity_type"          TEXT NOT NULL,

    -- Human-readable label shown to tenant during onboarding
    "label"                TEXT NOT NULL,

    -- Which entity_types can be parents of this level (empty array = root level)
    "allowed_parent_types" TEXT[] DEFAULT '{}',

    -- Only rows with is_default = true are used by the seed skill
    "is_default"           BOOLEAN DEFAULT TRUE,

    "created_at"           TIMESTAMPTZ DEFAULT NOW(),
    "updated_at"           TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT "m_facility_hierarchy_templates_level_check"
        CHECK ("level" >= 1 AND "level" <= 10),

    CONSTRAINT "m_facility_hierarchy_templates_unique"
        UNIQUE ("industry_id", "level", "entity_type", "is_default")
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_facility_templates_industry"
    ON "public"."m_facility_hierarchy_templates" ("industry_id");

CREATE INDEX IF NOT EXISTS "idx_facility_templates_industry_default"
    ON "public"."m_facility_hierarchy_templates" ("industry_id", "is_default")
    WHERE "is_default" = TRUE;

CREATE INDEX IF NOT EXISTS "idx_facility_templates_level"
    ON "public"."m_facility_hierarchy_templates" ("industry_id", "level");

-- ============================================================================
-- TRIGGER: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_facility_hierarchy_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_facility_hierarchy_templates_updated_at
    ON "public"."m_facility_hierarchy_templates";

CREATE TRIGGER trigger_facility_hierarchy_templates_updated_at
    BEFORE UPDATE ON "public"."m_facility_hierarchy_templates"
    FOR EACH ROW
    EXECUTE FUNCTION update_facility_hierarchy_templates_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE "public"."m_facility_hierarchy_templates"
    IS 'Global master table of industry-standard facility hierarchy structures. The seed skill reads is_default=true rows for the tenant industry and creates placeholder facility nodes during buyer onboarding.';

COMMENT ON COLUMN "public"."m_facility_hierarchy_templates"."industry_id"
    IS 'Soft reference to m_catalog_industries.id (VARCHAR key, e.g. healthcare, facility_management)';

COMMENT ON COLUMN "public"."m_facility_hierarchy_templates"."level"
    IS 'Hierarchy depth — 1 is root (top-most), numbers increase downward';

COMMENT ON COLUMN "public"."m_facility_hierarchy_templates"."entity_type"
    IS 'Internal type key used in allowed_parent_types arrays (e.g. campus, building, floor)';

COMMENT ON COLUMN "public"."m_facility_hierarchy_templates"."label"
    IS 'Human-readable name shown to the tenant (e.g. Campus, Ward / Unit, Bed / Station)';

COMMENT ON COLUMN "public"."m_facility_hierarchy_templates"."allowed_parent_types"
    IS 'entity_type values that can be parent of this level. Empty array means root level (no parent).';

COMMENT ON COLUMN "public"."m_facility_hierarchy_templates"."is_default"
    IS 'Only default=true rows are used by the seed skill. Allows future industry variants without changing the seed logic.';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE "public"."m_facility_hierarchy_templates" ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (used by onboarding skill and settings UI)
CREATE POLICY "read_facility_hierarchy_templates"
    ON "public"."m_facility_hierarchy_templates"
    FOR SELECT
    USING (TRUE);

-- Only service_role writes (admin-managed master data)
CREATE POLICY "service_role_write_facility_hierarchy_templates"
    ON "public"."m_facility_hierarchy_templates"
    FOR ALL
    USING ((auth.jwt() ->> 'role') = 'service_role')
    WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON "public"."m_facility_hierarchy_templates" TO authenticated;
GRANT ALL ON "public"."m_facility_hierarchy_templates" TO service_role;

-- ============================================================================
-- SEED DATA: Industry facility hierarchy templates
-- ============================================================================
-- 5 industries seeded. The seed skill reads level 1..N in order and creates
-- one placeholder node per level for the tenant.

INSERT INTO "public"."m_facility_hierarchy_templates"
    ("industry_id", "level", "entity_type", "label", "allowed_parent_types", "is_default")
VALUES

-- ── HEALTHCARE (Hospital / Clinic) ──────────────────────────────────────────
-- Typical: Apollo Multi-specialty → Main Block → 3rd Floor → ICU → Bed 12
('healthcare', 1, 'campus',   'Campus',       '{}',           TRUE),
('healthcare', 2, 'building', 'Building',     '{campus}',     TRUE),
('healthcare', 3, 'floor',    'Floor',        '{building}',   TRUE),
('healthcare', 4, 'ward',     'Ward / Unit',  '{floor}',      TRUE),
('healthcare', 5, 'bed',      'Bed / Station','{ward}',       TRUE),

-- ── FACILITY MANAGEMENT (Residential / Commercial Complex) ──────────────────
-- Typical: Embassy Golf Links → Tower A → Floor 12 → Suite 1201 → Server Zone
('facility_management', 1, 'campus',   'Campus',   '{}',           TRUE),
('facility_management', 2, 'building', 'Building', '{campus}',     TRUE),
('facility_management', 3, 'floor',    'Floor',    '{building}',   TRUE),
('facility_management', 4, 'room',     'Room',     '{floor}',      TRUE),
('facility_management', 5, 'zone',     'Zone',     '{room}',       TRUE),

-- ── MANUFACTURING (Factory / Plant) ─────────────────────────────────────────
-- Typical: Hyderabad Plant → Assembly Building → Line 3 → Station WS-07
('manufacturing', 1, 'plant',       'Plant',           '{}',         TRUE),
('manufacturing', 2, 'building',    'Building',        '{plant}',    TRUE),
('manufacturing', 3, 'line',        'Production Line', '{building}', TRUE),
('manufacturing', 4, 'workstation', 'Workstation',     '{line}',     TRUE),

-- ── HOSPITALITY (Hotel / Resort) ─────────────────────────────────────────────
-- Typical: Taj Banjara → Main Wing → Floor 5 → Room 512
('hospitality', 1, 'property', 'Property', '{}',          TRUE),
('hospitality', 2, 'building', 'Building', '{property}',  TRUE),
('hospitality', 3, 'floor',    'Floor',    '{building}',  TRUE),
('hospitality', 4, 'room',     'Room',     '{floor}',     TRUE),

-- ── REAL ESTATE / COMMERCIAL ─────────────────────────────────────────────────
-- Typical: Raheja Mindspace → Tower 2 → Floor 8 → Zone B
('real_estate', 1, 'campus',   'Campus',   '{}',           TRUE),
('real_estate', 2, 'tower',    'Tower',    '{campus}',     TRUE),
('real_estate', 3, 'floor',    'Floor',    '{tower}',      TRUE),
('real_estate', 4, 'zone',     'Zone',     '{floor}',      TRUE)

ON CONFLICT ("industry_id", "level", "entity_type", "is_default") DO UPDATE SET
    "label"                = EXCLUDED."label",
    "allowed_parent_types" = EXCLUDED."allowed_parent_types",
    "updated_at"           = NOW();
