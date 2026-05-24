-- Migration: Seed Lifts & Elevators and HVAC industries + resource templates
-- Description: Adds L&E and HVAC as catalog industries and seeds their
--              resource templates with pricing_guidance for Screen 8A benchmark bar.
--              These industries are not in m_catalog_industries master data yet.
-- Date: 2026-05-15

-- ============================================================================
-- STEP 1: INSERT MISSING INDUSTRIES into m_catalog_industries
-- ============================================================================
-- Both 'lifts_elevators' and 'hvac' are referenced in catalog-studio UI
-- (templates-list.tsx) but missing from the master table.

INSERT INTO "public"."m_catalog_industries" (
    "id",
    "name",
    "description",
    "icon",
    "common_pricing_rules",
    "compliance_requirements",
    "is_active",
    "sort_order"
) VALUES
(
    'lifts_elevators',
    'Lifts & Elevators',
    'Elevator installation, maintenance, and AMC services for residential, commercial, and industrial buildings',
    'ArrowUpDown',
    '[
        {"name":"Emergency Breakdown","action":"+100%","condition":"service_type = emergency"},
        {"name":"Multi-unit Discount","action":"-10%","condition":"elevator_count > 5"},
        {"name":"Annual AMC","action":"-8%","condition":"contract_type = annual"},
        {"name":"Comprehensive vs Basic","action":"+40%","condition":"coverage = comprehensive"},
        {"name":"High-rise Premium","action":"+20%","condition":"floors > 20"}
    ]',
    '["AERB Clearance","BIS Standards IS 14665","ASME A17.1 reference","State Lift Act compliance","Annual Third-Party Inspection"]',
    true,
    16
),
(
    'hvac',
    'HVAC & Cooling',
    'Heating, ventilation, and air conditioning installation, service, and maintenance contracts',
    'Thermometer',
    '[
        {"name":"Summer Peak","action":"+20%","condition":"season = summer"},
        {"name":"Emergency Service","action":"+80%","condition":"service_type = emergency"},
        {"name":"Multi-site Discount","action":"-12%","condition":"sites > 3"},
        {"name":"Annual AMC","action":"-8%","condition":"contract_type = annual"},
        {"name":"Refrigerant Top-up","action":"Per kg rate","condition":"service = refrigerant"}
    ]',
    '["BEE Energy Ratings","ASHRAE Standards","Refrigerant Handling Certification (MOEF)","BIS IS 1391 for ACs","IGBC Green Building compliance"]',
    true,
    17
)
ON CONFLICT ("id") DO UPDATE SET
    "name"                  = EXCLUDED."name",
    "description"           = EXCLUDED."description",
    "icon"                  = EXCLUDED."icon",
    "common_pricing_rules"  = EXCLUDED."common_pricing_rules",
    "compliance_requirements" = EXCLUDED."compliance_requirements",
    "updated_at"            = now();


-- ============================================================================
-- STEP 2: INSERT RESOURCE TEMPLATES for Lifts & Elevators
-- ============================================================================
-- pricing_guidance JSONB provides the benchmark bar data for Screen 8A.
-- Rates are INR, Hyderabad market, low confidence (seed data only).
-- Structure matches existing m_catalog_resource_templates seed pattern.

INSERT INTO "public"."m_catalog_resource_templates" (
    "industry_id",
    "resource_type_id",
    "name",
    "description",
    "default_attributes",
    "pricing_guidance",
    "popularity_score",
    "is_recommended",
    "is_active",
    "sort_order"
) VALUES

-- TEAM STAFF — Lift technicians and engineers
(
    'lifts_elevators',
    'team_staff',
    'Lift Technician (Entry)',
    'Junior lift maintenance technician, handles routine inspections and basic repairs',
    '{"experience_level":"basic","certifications":["lift_technician_certificate"],"skills":["routine_inspection","lubrication","basic_repair"]}',
    '{"suggested_hourly_rate":350,"market_range":{"min":250,"max":500},"note":"INR, Hyderabad, low confidence"}',
    0, true, true, 1
),
(
    'lifts_elevators',
    'team_staff',
    'Lift Technician (Intermediate)',
    'Experienced technician handling breakdown repairs, component replacement, and AMC visits',
    '{"experience_level":"intermediate","certifications":["lift_technician_certificate","electrical_safety"],"skills":["breakdown_repair","component_replacement","amc_visits"]}',
    '{"suggested_hourly_rate":500,"market_range":{"min":400,"max":750},"note":"INR, Hyderabad, low confidence"}',
    0, true, true, 2
),
(
    'lifts_elevators',
    'team_staff',
    'Lift Service Engineer (Senior)',
    'Senior engineer for complex fault diagnosis, modernisation, and compliance audits',
    '{"experience_level":"expert","certifications":["lift_technician_certificate","aerb_clearance","electrical_engineering"],"skills":["fault_diagnosis","modernisation","compliance_audit","high_rise"]}',
    '{"suggested_hourly_rate":900,"market_range":{"min":650,"max":1400},"note":"INR, Hyderabad, low confidence"}',
    0, true, true, 3
),

-- EQUIPMENT — Tools used during service
(
    'lifts_elevators',
    'equipment',
    'Lift Maintenance Toolkit',
    'Standard toolkit for lift servicing — rope gauges, tension meters, safety devices, multimeter',
    '{"maintenance_schedule":"quarterly","calibration_required":true,"safety_certification":true}',
    '{"daily_rate":600,"suggested_hourly_rate":80,"note":"INR, Hyderabad, low confidence"}',
    0, true, true, 1
),
(
    'lifts_elevators',
    'equipment',
    'Load Testing Equipment',
    'Calibrated weights and load testing apparatus for annual safety certification',
    '{"maintenance_schedule":"yearly","calibration_required":true,"certification":"third_party_required"}',
    '{"daily_rate":2500,"suggested_hourly_rate":350,"note":"INR, Hyderabad, low confidence"}',
    0, false, true, 2
),

-- CONSUMABLES — Parts and materials
(
    'lifts_elevators',
    'consumable',
    'Lift Parts & Lubricants',
    'Standard consumables — wire rope lubricant, guide rail grease, small components',
    '{"inventory_management":true,"expiry_tracking":false}',
    '{"cost_per_unit":1200,"bulk_discount":0.08,"note":"INR per service visit average, Hyderabad, low confidence"}',
    0, true, true, 1
),
(
    'lifts_elevators',
    'consumable',
    'Wire Ropes & Safety Components',
    'Wire ropes, safety gear, buffers — replaced on condition or per statutory cycle',
    '{"inventory_management":true,"warranty_tracking":true,"replacement_cycle":"5 years or condition-based"}',
    '{"cost_per_unit":8500,"bulk_discount":0.05,"note":"INR per set estimate, Hyderabad, low confidence"}',
    0, false, true, 2
)

ON CONFLICT DO NOTHING;


-- ============================================================================
-- STEP 3: INSERT RESOURCE TEMPLATES for HVAC
-- ============================================================================

INSERT INTO "public"."m_catalog_resource_templates" (
    "industry_id",
    "resource_type_id",
    "name",
    "description",
    "default_attributes",
    "pricing_guidance",
    "popularity_score",
    "is_recommended",
    "is_active",
    "sort_order"
) VALUES

-- TEAM STAFF
(
    'hvac',
    'team_staff',
    'HVAC Technician',
    'Trained technician for split AC, cassette, and duct servicing and breakdown repair',
    '{"experience_level":"intermediate","certifications":["hvac_certification","refrigerant_handling"],"skills":["split_ac","cassette_ac","basic_duct","breakdown_repair"]}',
    '{"suggested_hourly_rate":350,"market_range":{"min":250,"max":500},"note":"INR, Hyderabad, low confidence"}',
    0, true, true, 1
),
(
    'hvac',
    'team_staff',
    'Refrigeration Engineer',
    'Specialist for central AC, chillers, VRF systems, and refrigerant recovery',
    '{"experience_level":"expert","certifications":["refrigeration_engineering","moef_refrigerant_handling","electrical_safety"],"skills":["chiller","vrf","central_ac","refrigerant_recovery","energy_audit"]}',
    '{"suggested_hourly_rate":700,"market_range":{"min":500,"max":1000},"note":"INR, Hyderabad, low confidence"}',
    0, true, true, 2
),

-- EQUIPMENT
(
    'hvac',
    'equipment',
    'HVAC Diagnostic & Service Kit',
    'Leak detector, manifold gauge set, vacuum pump, clamp meter — standard field kit',
    '{"maintenance_schedule":"quarterly","calibration_required":true}',
    '{"daily_rate":900,"suggested_hourly_rate":130,"note":"INR, Hyderabad, low confidence"}',
    0, true, true, 1
),
(
    'hvac',
    'equipment',
    'Refrigerant Recovery Unit',
    'Recovery and reclaim unit required for R-22 and R-410A refrigerant service',
    '{"maintenance_schedule":"yearly","moef_compliance":true,"certification_required":true}',
    '{"daily_rate":1800,"suggested_hourly_rate":250,"note":"INR, Hyderabad, low confidence"}',
    0, false, true, 2
),

-- CONSUMABLES
(
    'hvac',
    'consumable',
    'Refrigerants & Coolants',
    'R-410A, R-32, R-22 refrigerants — sold per kg on actuals or AMC-included basis',
    '{"moef_compliance":true,"inventory_management":true,"expiry_tracking":false}',
    '{"cost_per_unit":950,"bulk_discount":0.05,"note":"INR per kg, R-410A, Hyderabad, low confidence"}',
    0, true, true, 1
),
(
    'hvac',
    'consumable',
    'HVAC Filters & Service Parts',
    'Air filters, capacitors, contactors, drain trays — routine replacement components',
    '{"inventory_management":true,"replacement_cycle":"6 months or condition-based"}',
    '{"cost_per_unit":380,"bulk_discount":0.10,"note":"INR per item average, Hyderabad, low confidence"}',
    0, true, true, 2
)

ON CONFLICT DO NOTHING;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON "public"."m_catalog_industries" TO authenticated;
GRANT ALL ON "public"."m_catalog_industries" TO service_role;

GRANT SELECT ON "public"."m_catalog_resource_templates" TO authenticated;
GRANT ALL ON "public"."m_catalog_resource_templates" TO service_role;
