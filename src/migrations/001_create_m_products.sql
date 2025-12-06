-- Migration: Create m_products table
-- Description: Product registry for multi-product architecture
-- Date: 2024-12-05

-- ============================================================================
-- CREATE TABLE: m_products
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."m_products" (
    "id" UUID DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "api_key_hash" VARCHAR(255),
    "env_prefix" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    "is_default" BOOLEAN DEFAULT false NOT NULL,
    "settings" JSONB DEFAULT '{}'::jsonb NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "created_by" UUID,

    CONSTRAINT "m_products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "m_products_code_unique" UNIQUE ("code"),
    CONSTRAINT "m_products_env_prefix_unique" UNIQUE ("env_prefix")
);

-- Add comments
COMMENT ON TABLE "public"."m_products" IS 'Product registry for multi-product architecture';
COMMENT ON COLUMN "public"."m_products"."code" IS 'Unique product code (contractnest, familyknows)';
COMMENT ON COLUMN "public"."m_products"."env_prefix" IS 'Environment variable prefix for this product (e.g., FK_ for familyknows)';
COMMENT ON COLUMN "public"."m_products"."is_default" IS 'Default product when X-Product header is missing';
COMMENT ON COLUMN "public"."m_products"."settings" IS 'Product-specific settings (GA4 ID, feature flags, etc.)';

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS "idx_m_products_code" ON "public"."m_products" ("code");
CREATE INDEX IF NOT EXISTS "idx_m_products_is_active" ON "public"."m_products" ("is_active");

-- ============================================================================
-- TRIGGER: Auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_m_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_m_products_updated_at ON "public"."m_products";
CREATE TRIGGER trigger_m_products_updated_at
    BEFORE UPDATE ON "public"."m_products"
    FOR EACH ROW
    EXECUTE FUNCTION update_m_products_updated_at();

-- ============================================================================
-- SEED DATA: Initial products
-- ============================================================================

INSERT INTO "public"."m_products" (
    "code",
    "name",
    "description",
    "env_prefix",
    "is_active",
    "is_default",
    "settings"
) VALUES
(
    'contractnest',
    'ContractNest',
    'Contract management and service catalog platform for businesses',
    '',
    true,
    true,
    '{
        "ga4_measurement_id": null,
        "features": {
            "firebase_storage": true,
            "google_drive": false,
            "whatsapp_integration": true,
            "email_integration": true
        },
        "branding": {
            "primary_color": "#4F46E5",
            "logo_url": null
        }
    }'::jsonb
),
(
    'familyknows',
    'FamilyKnows',
    'Family management mobile application',
    'FK_',
    true,
    false,
    '{
        "ga4_measurement_id": null,
        "features": {
            "firebase_storage": false,
            "google_drive": true,
            "whatsapp_integration": true,
            "email_integration": true
        },
        "branding": {
            "primary_color": "#10B981",
            "logo_url": null
        },
        "mobile_only": true
    }'::jsonb
)
ON CONFLICT ("code") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "settings" = EXCLUDED."settings",
    "updated_at" = now();

-- ============================================================================
-- RLS POLICIES (if needed)
-- ============================================================================

ALTER TABLE "public"."m_products" ENABLE ROW LEVEL SECURITY;

-- Policy: Super admins can manage products
CREATE POLICY "super_admins_manage_products" ON "public"."m_products"
    FOR ALL
    USING (true)  -- Will be refined with actual super admin check
    WITH CHECK (true);

-- Policy: All authenticated users can read active products
CREATE POLICY "read_active_products" ON "public"."m_products"
    FOR SELECT
    USING ("is_active" = true);

-- Grant permissions
GRANT SELECT ON "public"."m_products" TO authenticated;
GRANT ALL ON "public"."m_products" TO service_role;
