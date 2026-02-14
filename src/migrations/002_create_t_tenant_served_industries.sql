-- Migration: Create t_tenant_served_industries table
-- Description: Junction table for industries a tenant serves (multi-select)
-- Date: 2025-02-13

-- ============================================================================
-- CREATE TABLE: t_tenant_served_industries
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."t_tenant_served_industries" (
    "id" UUID DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "tenant_id" UUID NOT NULL,
    "industry_id" VARCHAR(50) NOT NULL,
    "added_by" UUID,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT "t_tenant_served_industries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "t_tenant_served_industries_unique" UNIQUE ("tenant_id", "industry_id"),
    CONSTRAINT "t_tenant_served_industries_tenant_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "t_tenant_served_industries_industry_fk"
        FOREIGN KEY ("industry_id") REFERENCES "public"."m_catalog_industries"("id") ON DELETE CASCADE
);

-- Add comments
COMMENT ON TABLE "public"."t_tenant_served_industries" IS 'Industries that a tenant serves/services (multi-select)';
COMMENT ON COLUMN "public"."t_tenant_served_industries"."tenant_id" IS 'The tenant who serves this industry';
COMMENT ON COLUMN "public"."t_tenant_served_industries"."industry_id" IS 'Reference to m_catalog_industries';
COMMENT ON COLUMN "public"."t_tenant_served_industries"."added_by" IS 'User who added this industry';

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS "idx_t_tenant_served_industries_tenant"
    ON "public"."t_tenant_served_industries" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_t_tenant_served_industries_industry"
    ON "public"."t_tenant_served_industries" ("industry_id");

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE "public"."t_tenant_served_industries" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own tenant's served industries
CREATE POLICY "tenant_read_served_industries" ON "public"."t_tenant_served_industries"
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM "public"."t_user_tenants"
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Policy: Users can insert served industries for their own tenant
CREATE POLICY "tenant_insert_served_industries" ON "public"."t_tenant_served_industries"
    FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM "public"."t_user_tenants"
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Policy: Users can delete served industries for their own tenant
CREATE POLICY "tenant_delete_served_industries" ON "public"."t_tenant_served_industries"
    FOR DELETE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM "public"."t_user_tenants"
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON "public"."t_tenant_served_industries" TO authenticated;
GRANT ALL ON "public"."t_tenant_served_industries" TO service_role;
