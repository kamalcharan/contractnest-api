

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "timescaledb" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "n8n";


ALTER SCHEMA "n8n" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgroonga" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "vector";


ALTER SCHEMA "vector" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "autoinc" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "insert_username" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "isn" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_jsonschema" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgmq" WITH SCHEMA "pgmq";






CREATE EXTENSION IF NOT EXISTS "pgroonga_database" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "tiger";






CREATE EXTENSION IF NOT EXISTS "postgis_tiger_geocoder" WITH SCHEMA "tiger";






CREATE EXTENSION IF NOT EXISTS "postgis_topology" WITH SCHEMA "topology";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_contact_classification"("contact_id" "uuid", "classification" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE t_contacts 
    SET classifications = classifications || to_jsonb(classification)
    WHERE id = contact_id 
    AND NOT (classifications ? classification);
END;
$$;


ALTER FUNCTION "public"."add_contact_classification"("contact_id" "uuid", "classification" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_contact_tag"("contact_id" "uuid", "tag_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE t_contacts 
    SET tags = tags || jsonb_build_array(tag_data)
    WHERE id = contact_id 
    AND NOT (tags @> jsonb_build_array(tag_data));
END;
$$;


ALTER FUNCTION "public"."add_contact_tag"("contact_id" "uuid", "tag_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."associate_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_resource_data" "jsonb", "p_idempotency_key" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_existing_service record;
    v_result jsonb;
    v_resource record;
    v_existing_operation_id uuid;
    v_processed_resources jsonb := '[]'::jsonb;
    v_errors jsonb := '[]'::jsonb;
    v_success_count integer := 0;
    v_error_count integer := 0;
  BEGIN
    -- 1. IDEMPOTENCY CHECK
    IF p_idempotency_key IS NOT NULL THEN
      SELECT service_id INTO v_existing_operation_id
      FROM t_idempotency_keys
      WHERE idempotency_key = p_idempotency_key
        AND tenant_id = p_tenant_id
        AND operation_type = 'associate_resources'
        AND created_at > NOW() - INTERVAL '24 hours';

      IF FOUND THEN
        -- Return existing resources for this service
        RETURN jsonb_build_object(
          'success', true,
          'message', 'Resources already associated (idempotency)',
          'data', (SELECT get_service_resources(v_existing_operation_id, p_tenant_id, p_is_live))
        );
      END IF;
    END IF;

    -- 2. VALIDATE INPUT PARAMETERS
    IF p_service_id IS NULL OR p_tenant_id IS NULL OR p_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'service_id, tenant_id, and user_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    IF p_resource_data IS NULL OR jsonb_array_length(p_resource_data) = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'resource_data array is required and cannot be empty',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 3. TRANSACTION START WITH ROW-LEVEL LOCKING
    -- Lock the service record to prevent concurrent modifications
    SELECT * INTO v_existing_service
    FROM t_catalog_items
    WHERE id = p_service_id
      AND tenant_id = p_tenant_id
      AND is_live = p_is_live
    FOR UPDATE NOWAIT;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service not found or access denied',
        'code', 'RECORD_NOT_FOUND'
      );
    END IF;

    -- 4. VALIDATE SERVICE STATUS
    IF v_existing_service.status = 'archived' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot modify resources for archived service',
        'code', 'SERVICE_ARCHIVED'
      );
    END IF;

    -- 5. PROCESS RESOURCE ASSOCIATIONS WITH ERROR HANDLING
    FOR v_resource IN
      SELECT * FROM jsonb_to_recordset(p_resource_data) AS x(
        id uuid,
        resource_type_id varchar(50),
        allocation_type_id uuid,
        quantity_required integer,
        duration_hours decimal(5,2),
        unit_cost decimal(15,4),
        currency_code varchar(3),
        required_skills jsonb,
        required_attributes jsonb,
        sequence_order integer,
        is_billable boolean,
        action varchar(10) -- 'add', 'update', 'remove'
      )
    LOOP
      BEGIN
        -- SMART RECORD DETECTION AND SAFE OPERATIONS
        IF v_resource.action = 'remove' AND v_resource.id IS NOT NULL THEN
          -- Only remove explicitly marked resources with ownership check
          UPDATE t_catalog_service_resources
          SET is_active = false, updated_at = NOW()
          WHERE service_id = p_service_id
            AND id = v_resource.id
            AND tenant_id = p_tenant_id
            AND is_active = true;

          IF FOUND THEN
            v_success_count := v_success_count + 1;
            v_processed_resources := v_processed_resources || jsonb_build_object(
              'action', 'remove',
              'resource_id', v_resource.id,
              'resource_type_id', v_resource.resource_type_id,
              'status', 'success'
            );
          ELSE
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
              'action', 'remove',
              'resource_id', v_resource.id,
              'error', 'Resource association not found or already inactive'
            );
          END IF;

        ELSIF v_resource.id IS NULL OR v_resource.id::text LIKE 'temp_%' OR v_resource.action = 'add' THEN
          -- This is a new resource association
          -- Validate resource_type_id exists
          IF NOT EXISTS(SELECT 1 FROM m_catalog_resource_types WHERE id = v_resource.resource_type_id AND is_active = true) THEN
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
              'action', 'add',
              'resource_type_id', v_resource.resource_type_id,
              'error', 'Invalid resource_type_id'
            );
            CONTINUE;
          END IF;

          -- Validate allocation_type_id if provided
          IF v_resource.allocation_type_id IS NOT NULL THEN
            IF NOT EXISTS(
              SELECT 1 FROM m_category_details cd
              JOIN m_category_master cm ON cd.category_id = cm.id
              WHERE cd.id = v_resource.allocation_type_id
                AND cm.category_name = 'resource_allocation_types'
                AND cd.is_active = true
            ) THEN
              v_error_count := v_error_count + 1;
              v_errors := v_errors || jsonb_build_object(
                'action', 'add',
                'allocation_type_id', v_resource.allocation_type_id,
                'error', 'Invalid allocation_type_id'
              );
              CONTINUE;
            END IF;
          END IF;

          -- Check for duplicate resource type in same service
          IF EXISTS(
            SELECT 1 FROM t_catalog_service_resources
            WHERE service_id = p_service_id
              AND resource_type_id = v_resource.resource_type_id
              AND tenant_id = p_tenant_id
              AND is_active = true
          ) THEN
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
              'action', 'add',
              'resource_type_id', v_resource.resource_type_id,
              'error', 'Resource type already associated with this service'
            );
            CONTINUE;
          END IF;

          -- Insert new resource association
          INSERT INTO t_catalog_service_resources (
            service_id, resource_type_id, tenant_id, allocation_type_id,
            quantity_required, duration_hours, unit_cost, currency_code,
            required_skills, required_attributes, sequence_order, is_billable
          ) VALUES (
            p_service_id, v_resource.resource_type_id, p_tenant_id,
            v_resource.allocation_type_id, COALESCE(v_resource.quantity_required, 1),
            v_resource.duration_hours, v_resource.unit_cost,
            COALESCE(v_resource.currency_code, 'INR'),
            COALESCE(v_resource.required_skills, '[]'::jsonb),
            COALESCE(v_resource.required_attributes, '{}'::jsonb),
            COALESCE(v_resource.sequence_order, 0),
            COALESCE(v_resource.is_billable, true)
          );

          v_success_count := v_success_count + 1;
          v_processed_resources := v_processed_resources || jsonb_build_object(
            'action', 'add',
            'resource_type_id', v_resource.resource_type_id,
            'allocation_type_id', v_resource.allocation_type_id,
            'quantity_required', COALESCE(v_resource.quantity_required, 1),
            'status', 'success'
          );

        ELSIF v_resource.action = 'update' AND v_resource.id IS NOT NULL THEN
          -- Update existing resource association with security check
          UPDATE t_catalog_service_resources SET
            allocation_type_id = COALESCE(v_resource.allocation_type_id, allocation_type_id),
            quantity_required = COALESCE(v_resource.quantity_required, quantity_required),
            duration_hours = COALESCE(v_resource.duration_hours, duration_hours),
            unit_cost = COALESCE(v_resource.unit_cost, unit_cost),
            currency_code = COALESCE(v_resource.currency_code, currency_code),
            required_skills = CASE
              WHEN v_resource.required_skills IS NOT NULL
              THEN v_resource.required_skills
              ELSE required_skills
            END,
            required_attributes = CASE
              WHEN v_resource.required_attributes IS NOT NULL
              THEN v_resource.required_attributes
              ELSE required_attributes
            END,
            sequence_order = COALESCE(v_resource.sequence_order, sequence_order),
            is_billable = COALESCE(v_resource.is_billable, is_billable),
            updated_at = NOW()
          WHERE id = v_resource.id
            AND service_id = p_service_id
            AND tenant_id = p_tenant_id
            AND is_active = true;

          IF FOUND THEN
            v_success_count := v_success_count + 1;
            v_processed_resources := v_processed_resources || jsonb_build_object(
              'action', 'update',
              'resource_id', v_resource.id,
              'resource_type_id', v_resource.resource_type_id,
              'status', 'success'
            );
          ELSE
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
              'action', 'update',
              'resource_id', v_resource.id,
              'error', 'Resource association not found or inactive'
            );
          END IF;
        END IF;

      EXCEPTION
        WHEN OTHERS THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'action', COALESCE(v_resource.action, 'unknown'),
            'resource_type_id', v_resource.resource_type_id,
            'error', SQLERRM
          );
      END;
    END LOOP;

    -- 6. UPDATE SERVICE RESOURCE REQUIREMENTS SUMMARY
    UPDATE t_catalog_items SET
      resource_requirements = resource_requirements || jsonb_build_object(
        'total_resources', (
          SELECT COUNT(*) FROM t_catalog_service_resources
          WHERE service_id = p_service_id AND is_active = true
        ),
        'last_updated', NOW(),
        'updated_by', p_user_id
      ),
      updated_by = p_user_id,
      updated_at = NOW()
    WHERE id = p_service_id AND tenant_id = p_tenant_id;

    -- 7. STORE IDEMPOTENCY KEY
    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO t_idempotency_keys (
        idempotency_key,
        tenant_id,
        operation_type,
        service_id,
        created_at
      ) VALUES (
        p_idempotency_key,
        p_tenant_id,
        'associate_resources',
        p_service_id,
        NOW()
      );
    END IF;

    -- 8. PREPARE RESULT
    SELECT jsonb_build_object(
      'service_id', p_service_id,
      'processed_resources', v_processed_resources,
      'errors', v_errors,
      'summary', jsonb_build_object(
        'total_processed', v_success_count + v_error_count,
        'successful', v_success_count,
        'failed', v_error_count,
        'current_total_resources', (
          SELECT COUNT(*) FROM t_catalog_service_resources
          WHERE service_id = p_service_id
            AND tenant_id = p_tenant_id
            AND is_active = true
        )
      ),
      'updated_at', NOW()
    ) INTO v_result;

    -- 9. SUCCESS RESPONSE
    RETURN jsonb_build_object(
      'success', CASE WHEN v_error_count = 0 THEN true ELSE v_success_count > 0 END,
      'data', v_result,
      'message', CASE
        WHEN v_error_count = 0 THEN 'All resource associations processed successfully'
        WHEN v_success_count = 0 THEN 'All resource associations failed'
        ELSE 'Resource associations partially processed with some errors'
      END
    );

  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service is being updated by another user. Please try again.',
        'code', 'CONCURRENT_UPDATE'
      );
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING WITH ROLLBACK
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."associate_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_resource_data" "jsonb", "p_idempotency_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_create_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_services_data" "jsonb", "p_idempotency_key" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_existing_operation_id uuid;
    v_service_data jsonb;
    v_service_index integer := 0;
    v_created_services jsonb := '[]'::jsonb;
    v_errors jsonb := '[]'::jsonb;
    v_success_count integer := 0;
    v_error_count integer := 0;
    v_service_result jsonb;
    v_service_id uuid;
    v_resource record;
    v_validation_errors text[];
    v_duplicate_names text[];
  BEGIN
    -- 1. IDEMPOTENCY CHECK
    IF p_idempotency_key IS NOT NULL THEN
      SELECT service_id INTO v_existing_operation_id
      FROM t_idempotency_keys
      WHERE idempotency_key = p_idempotency_key
        AND tenant_id = p_tenant_id
        AND operation_type = 'bulk_create_services'
        AND created_at > NOW() - INTERVAL '24 hours';

      IF FOUND THEN
        -- Return cached result for bulk operation
        RETURN jsonb_build_object(
          'success', true,
          'message', 'Bulk operation already completed (idempotency)',
          'data', jsonb_build_object(
            'operation_id', v_existing_operation_id,
            'status', 'completed'
          )
        );
      END IF;
    END IF;

    -- 2. VALIDATE INPUT PARAMETERS
    IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'tenant_id and user_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    IF p_services_data IS NULL OR jsonb_array_length(p_services_data) = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'services_data array is required and cannot be empty',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 3. VALIDATE BULK OPERATION LIMITS
    IF jsonb_array_length(p_services_data) > 100 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bulk operation limited to 100 services maximum',
        'code', 'BULK_LIMIT_EXCEEDED'
      );
    END IF;

    -- 4. PRE-VALIDATION: CHECK FOR DUPLICATE NAMES IN BATCH
    SELECT array_agg(DISTINCT service->>'name') INTO v_duplicate_names
    FROM jsonb_array_elements(p_services_data) AS service
    WHERE service->>'name' IN (
      SELECT name FROM t_catalog_items
      WHERE tenant_id = p_tenant_id
        AND is_live = p_is_live
        AND status != 'archived'
    );

    IF array_length(v_duplicate_names, 1) > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Duplicate service names found: ' || array_to_string(v_duplicate_names, ', '),
        'code', 'DUPLICATE_NAMES',
        'duplicate_names', array_to_json(v_duplicate_names)
      );
    END IF;

    -- 5. PROCESS SERVICES IN TRANSACTION (ALL-OR-NOTHING FOR REFERENTIAL INTEGRITY)
    FOR v_service_data IN SELECT * FROM jsonb_array_elements(p_services_data)
    LOOP
      v_service_index := v_service_index + 1;

      BEGIN
        -- Reset validation errors for each service
        v_validation_errors := '{}';

        -- Basic validation for each service
        IF v_service_data->>'name' IS NULL OR trim(v_service_data->>'name') = '' THEN
          v_validation_errors := v_validation_errors || 'Service name is required';
        END IF;

        -- Validate master data references if provided
        IF v_service_data->'price_attributes'->>'pricing_type_id' IS NOT NULL THEN
          IF NOT EXISTS(
            SELECT 1 FROM m_category_details cd
            JOIN m_category_master cm ON cd.category_id = cm.id
            WHERE cd.id = (v_service_data->'price_attributes'->>'pricing_type_id')::uuid
              AND cm.category_name = 'pricing_types'
              AND cd.is_active = true
          ) THEN
            v_validation_errors := v_validation_errors || 'Invalid pricing_type_id';
          END IF;
        END IF;

        IF v_service_data->'service_attributes'->>'service_status_id' IS NOT NULL THEN
          IF NOT EXISTS(
            SELECT 1 FROM m_category_details cd
            JOIN m_category_master cm ON cd.category_id = cm.id
            WHERE cd.id = (v_service_data->'service_attributes'->>'service_status_id')::uuid
              AND cm.category_name = 'service_statuses'
              AND cd.is_active = true
          ) THEN
            v_validation_errors := v_validation_errors || 'Invalid service_status_id';
          END IF;
        END IF;

        -- If validation errors exist, add to errors array and continue
        IF array_length(v_validation_errors, 1) > 0 THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_service_index,
            'service_name', v_service_data->>'name',
            'errors', array_to_json(v_validation_errors)
          );
          CONTINUE;
        END IF;

        -- CREATE SERVICE
        INSERT INTO t_catalog_items (
          tenant_id,
          name,
          short_description,
          description_content,
          description_format,
          type,
          industry_id,
          category_id,
          status,
          is_live,
          price_attributes,
          tax_config,
          service_attributes,
          resource_requirements,
          specifications,
          terms_content,
          terms_format,
          variant_attributes,
          metadata,
          created_by,
          updated_by
        ) VALUES (
          p_tenant_id,
          trim(v_service_data->>'name'),
          v_service_data->>'short_description',
          v_service_data->>'description_content',
          COALESCE(v_service_data->>'description_format', 'markdown'),
          COALESCE(v_service_data->>'type', 'service'),
          v_service_data->>'industry_id',
          v_service_data->>'category_id',
          COALESCE(v_service_data->>'status', 'draft'),
          p_is_live,
          COALESCE(v_service_data->'price_attributes', '{}'::jsonb),
          COALESCE(v_service_data->'tax_config', '{}'::jsonb),
          COALESCE(v_service_data->'service_attributes', '{}'::jsonb),
          COALESCE(v_service_data->'resource_requirements', '{}'::jsonb),
          COALESCE(v_service_data->'specifications', '{}'::jsonb),
          v_service_data->>'terms_content',
          COALESCE(v_service_data->>'terms_format', 'markdown'),
          COALESCE(v_service_data->'variant_attributes', '{}'::jsonb),
          COALESCE(v_service_data->'metadata', '{}'::jsonb) || jsonb_build_object('bulk_created', true, 'bulk_index', v_service_index),       
          p_user_id,
          p_user_id
        ) RETURNING id INTO v_service_id;

        -- HANDLE RESOURCES IF PROVIDED
        IF v_service_data->'resources' IS NOT NULL AND jsonb_array_length(v_service_data->'resources') > 0 THEN
          FOR v_resource IN
            SELECT * FROM jsonb_to_recordset(v_service_data->'resources') AS x(
              resource_type_id varchar(50),
              allocation_type_id uuid,
              quantity_required integer,
              duration_hours decimal(5,2),
              unit_cost decimal(15,4),
              currency_code varchar(3),
              required_skills jsonb,
              required_attributes jsonb,
              sequence_order integer
            )
          LOOP
            -- Validate resource_type_id exists
            IF NOT EXISTS(SELECT 1 FROM m_catalog_resource_types WHERE id = v_resource.resource_type_id AND is_active = true) THEN
              RAISE EXCEPTION 'Invalid resource_type_id: %', v_resource.resource_type_id;
            END IF;

            -- Insert service-resource relationship
            INSERT INTO t_catalog_service_resources (
              service_id,
              resource_type_id,
              tenant_id,
              allocation_type_id,
              quantity_required,
              duration_hours,
              unit_cost,
              currency_code,
              required_skills,
              required_attributes,
              sequence_order
            ) VALUES (
              v_service_id,
              v_resource.resource_type_id,
              p_tenant_id,
              v_resource.allocation_type_id,
              COALESCE(v_resource.quantity_required, 1),
              v_resource.duration_hours,
              v_resource.unit_cost,
              COALESCE(v_resource.currency_code, 'INR'),
              COALESCE(v_resource.required_skills, '[]'::jsonb),
              COALESCE(v_resource.required_attributes, '{}'::jsonb),
              COALESCE(v_resource.sequence_order, 0)
            );
          END LOOP;
        END IF;

        -- ADD TO SUCCESS ARRAY
        v_success_count := v_success_count + 1;
        v_created_services := v_created_services || jsonb_build_object(
          'index', v_service_index,
          'service_id', v_service_id,
          'service_name', v_service_data->>'name',
          'type', COALESCE(v_service_data->>'type', 'service'),
          'status', COALESCE(v_service_data->>'status', 'draft'),
          'resource_count', CASE
            WHEN v_service_data->'resources' IS NOT NULL
            THEN jsonb_array_length(v_service_data->'resources')
            ELSE 0
          END,
          'created_at', NOW()
        );

      EXCEPTION
        WHEN OTHERS THEN
          -- Individual service creation failed
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_service_index,
            'service_name', v_service_data->>'name',
            'error', SQLERRM
          );
      END;
    END LOOP;

    -- 6. STORE IDEMPOTENCY KEY FOR SUCCESSFUL OPERATIONS
    IF p_idempotency_key IS NOT NULL AND v_success_count > 0 THEN
      INSERT INTO t_idempotency_keys (
        idempotency_key,
        tenant_id,
        operation_type,
        service_id,
        created_at
      ) VALUES (
        p_idempotency_key,
        p_tenant_id,
        'bulk_create_services',
        NULL, -- No single service ID for bulk operations
        NOW()
      );
    END IF;

    -- 7. DETERMINE OVERALL SUCCESS STATUS
    DECLARE
      v_overall_success boolean := v_error_count = 0;
      v_partial_success boolean := v_success_count > 0 AND v_error_count > 0;
    BEGIN
      RETURN jsonb_build_object(
        'success', v_overall_success,
        'partial_success', v_partial_success,
        'data', jsonb_build_object(
          'created_services', v_created_services,
          'errors', v_errors,
          'summary', jsonb_build_object(
            'total_requested', jsonb_array_length(p_services_data),
            'successful_creations', v_success_count,
            'failed_creations', v_error_count,
            'success_rate', CASE
              WHEN jsonb_array_length(p_services_data) > 0
              THEN ROUND((v_success_count::decimal / jsonb_array_length(p_services_data)) * 100, 2)
              ELSE 0
            END
          ),
          'operation_completed_at', NOW()
        ),
        'message', CASE
          WHEN v_overall_success THEN 'All services created successfully'
          WHEN v_partial_success THEN 'Bulk operation completed with some failures'
          ELSE 'Bulk operation failed - no services created'
        END
      );
    END;

  EXCEPTION
    WHEN OTHERS THEN
      -- TRANSACTION ROLLBACK ON CRITICAL ERROR
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bulk operation failed: ' || SQLERRM,
        'code', 'BULK_OPERATION_ERROR',
        'partial_results', jsonb_build_object(
          'processed_count', v_service_index,
          'success_count', v_success_count,
          'error_count', v_error_count
        )
      );
  END;
  $$;


ALTER FUNCTION "public"."bulk_create_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_services_data" "jsonb", "p_idempotency_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_update_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_updates_data" "jsonb", "p_idempotency_key" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_existing_operation_id uuid;
    v_update_data jsonb;
    v_update_index integer := 0;
    v_updated_services jsonb := '[]'::jsonb;
    v_errors jsonb := '[]'::jsonb;
    v_success_count integer := 0;
    v_error_count integer := 0;
    v_service_id uuid;
    v_existing_service record;
    v_validation_errors text[];
    v_locked_services uuid[];
  BEGIN
    -- 1. IDEMPOTENCY CHECK
    IF p_idempotency_key IS NOT NULL THEN
      SELECT service_id INTO v_existing_operation_id
      FROM t_idempotency_keys
      WHERE idempotency_key = p_idempotency_key
        AND tenant_id = p_tenant_id
        AND operation_type = 'bulk_update_services'
        AND created_at > NOW() - INTERVAL '24 hours';

      IF FOUND THEN
        RETURN jsonb_build_object(
          'success', true,
          'message', 'Bulk update already completed (idempotency)',
          'data', jsonb_build_object(
            'operation_id', v_existing_operation_id,
            'status', 'completed'
          )
        );
      END IF;
    END IF;

    -- 2. VALIDATE INPUT PARAMETERS
    IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'tenant_id and user_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    IF p_updates_data IS NULL OR jsonb_array_length(p_updates_data) = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'updates_data array is required and cannot be empty',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 3. VALIDATE BULK OPERATION LIMITS
    IF jsonb_array_length(p_updates_data) > 100 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bulk update limited to 100 services maximum',
        'code', 'BULK_LIMIT_EXCEEDED'
      );
    END IF;

    -- 4. PRE-LOCK ALL SERVICES TO PREVENT RACE CONDITIONS
    BEGIN
      FOR v_update_data IN SELECT * FROM jsonb_array_elements(p_updates_data)
      LOOP
        v_service_id := (v_update_data->>'id')::uuid;

        IF v_service_id IS NULL THEN
          CONTINUE;
        END IF;

        -- Attempt to lock each service
        SELECT * INTO v_existing_service
        FROM t_catalog_items
        WHERE id = v_service_id
          AND tenant_id = p_tenant_id
          AND is_live = p_is_live
        FOR UPDATE NOWAIT;

        IF FOUND THEN
          v_locked_services := v_locked_services || v_service_id;
        END IF;
      END LOOP;

    EXCEPTION
      WHEN lock_not_available THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'One or more services are being updated by another user. Please try again.',
          'code', 'CONCURRENT_UPDATE',
          'locked_services', COALESCE(array_length(v_locked_services, 1), 0)
        );
    END;

    -- 5. PROCESS SERVICE UPDATES
    FOR v_update_data IN SELECT * FROM jsonb_array_elements(p_updates_data)
    LOOP
      v_update_index := v_update_index + 1;

      BEGIN
        -- Reset validation errors for each update
        v_validation_errors := '{}';
        v_service_id := (v_update_data->>'id')::uuid;

        -- Validate service ID
        IF v_service_id IS NULL THEN
          v_validation_errors := v_validation_errors || 'Service ID is required';
        END IF;

        -- Get existing service (should already be locked)
        SELECT * INTO v_existing_service
        FROM t_catalog_items
        WHERE id = v_service_id
          AND tenant_id = p_tenant_id
          AND is_live = p_is_live;

        IF NOT FOUND THEN
          v_validation_errors := v_validation_errors || 'Service not found or access denied';
        END IF;

        -- Validate archived status
        IF v_existing_service.status = 'archived' THEN
          v_validation_errors := v_validation_errors || 'Cannot update archived service';
        END IF;

        -- Validate master data references if being updated
        IF v_update_data->'price_attributes'->>'pricing_type_id' IS NOT NULL THEN
          IF NOT EXISTS(
            SELECT 1 FROM m_category_details cd
            JOIN m_category_master cm ON cd.category_id = cm.id
            WHERE cd.id = (v_update_data->'price_attributes'->>'pricing_type_id')::uuid
              AND cm.category_name = 'pricing_types'
              AND cd.is_active = true
          ) THEN
            v_validation_errors := v_validation_errors || 'Invalid pricing_type_id';
          END IF;
        END IF;

        IF v_update_data->'service_attributes'->>'service_status_id' IS NOT NULL THEN
          IF NOT EXISTS(
            SELECT 1 FROM m_category_details cd
            JOIN m_category_master cm ON cd.category_id = cm.id
            WHERE cd.id = (v_update_data->'service_attributes'->>'service_status_id')::uuid
              AND cm.category_name = 'service_statuses'
              AND cd.is_active = true
          ) THEN
            v_validation_errors := v_validation_errors || 'Invalid service_status_id';
          END IF;
        END IF;

        -- Check for duplicate name if name is being updated
        IF v_update_data->>'name' IS NOT NULL
           AND LOWER(trim(v_update_data->>'name')) != LOWER(v_existing_service.name) THEN
          IF EXISTS(
            SELECT 1 FROM t_catalog_items
            WHERE tenant_id = p_tenant_id
              AND is_live = p_is_live
              AND id != v_service_id
              AND LOWER(name) = LOWER(trim(v_update_data->>'name'))
              AND status != 'archived'
          ) THEN
            v_validation_errors := v_validation_errors || 'Service name already exists';
          END IF;
        END IF;

        -- If validation errors exist, add to errors array and continue
        IF array_length(v_validation_errors, 1) > 0 THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_update_index,
            'service_id', v_service_id,
            'service_name', COALESCE(v_update_data->>'name', v_existing_service.name),
            'errors', array_to_json(v_validation_errors)
          );
          CONTINUE;
        END IF;

        -- CONSERVATIVE UPDATE - ONLY UPDATE PROVIDED FIELDS
        UPDATE t_catalog_items SET
          name = CASE
            WHEN v_update_data->>'name' IS NOT NULL
            THEN trim(v_update_data->>'name')
            ELSE name
          END,
          short_description = COALESCE(v_update_data->>'short_description', short_description),
          description_content = COALESCE(v_update_data->>'description_content', description_content),
          description_format = COALESCE(v_update_data->>'description_format', description_format),
          type = COALESCE(v_update_data->>'type', type),
          industry_id = COALESCE(v_update_data->>'industry_id', industry_id),
          category_id = COALESCE(v_update_data->>'category_id', category_id),
          status = COALESCE(v_update_data->>'status', status),
          -- SAFE JSONB MERGING - preserve existing data, merge new data
          price_attributes = CASE
            WHEN v_update_data->'price_attributes' IS NOT NULL
            THEN price_attributes || v_update_data->'price_attributes'
            ELSE price_attributes
          END,
          tax_config = CASE
            WHEN v_update_data->'tax_config' IS NOT NULL
            THEN tax_config || v_update_data->'tax_config'
            ELSE tax_config
          END,
          service_attributes = CASE
            WHEN v_update_data->'service_attributes' IS NOT NULL
            THEN service_attributes || v_update_data->'service_attributes'
            ELSE service_attributes
          END,
          resource_requirements = CASE
            WHEN v_update_data->'resource_requirements' IS NOT NULL
            THEN resource_requirements || v_update_data->'resource_requirements'
            ELSE resource_requirements
          END,
          specifications = CASE
            WHEN v_update_data->'specifications' IS NOT NULL
            THEN specifications || v_update_data->'specifications'
            ELSE specifications
          END,
          terms_content = COALESCE(v_update_data->>'terms_content', terms_content),
          terms_format = COALESCE(v_update_data->>'terms_format', terms_format),
          variant_attributes = CASE
            WHEN v_update_data->'variant_attributes' IS NOT NULL
            THEN variant_attributes || v_update_data->'variant_attributes'
            ELSE variant_attributes
          END,
          metadata = CASE
            WHEN v_update_data->'metadata' IS NOT NULL
            THEN metadata || v_update_data->'metadata'
            ELSE metadata
          END || jsonb_build_object(
            'bulk_updated', true,
            'bulk_index', v_update_index,
            'bulk_updated_at', NOW()
          ),
          updated_by = p_user_id,
          updated_at = NOW()
        WHERE id = v_service_id
          AND tenant_id = p_tenant_id
          AND is_live = p_is_live;

        -- ADD TO SUCCESS ARRAY
        v_success_count := v_success_count + 1;
        v_updated_services := v_updated_services || jsonb_build_object(
          'index', v_update_index,
          'service_id', v_service_id,
          'service_name', COALESCE(v_update_data->>'name', v_existing_service.name),
          'previous_status', v_existing_service.status,
          'current_status', COALESCE(v_update_data->>'status', v_existing_service.status),
          'fields_updated', (
            SELECT jsonb_agg(key)
            FROM jsonb_object_keys(v_update_data) AS key
            WHERE key NOT IN ('id', 'metadata')
          ),
          'updated_at', NOW()
        );

      EXCEPTION
        WHEN OTHERS THEN
          -- Individual service update failed
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_update_index,
            'service_id', v_service_id,
            'service_name', COALESCE(v_update_data->>'name', 'Unknown'),
            'error', SQLERRM
          );
      END;
    END LOOP;

    -- 6. STORE IDEMPOTENCY KEY FOR SUCCESSFUL OPERATIONS
    IF p_idempotency_key IS NOT NULL AND v_success_count > 0 THEN
      INSERT INTO t_idempotency_keys (
        idempotency_key,
        tenant_id,
        operation_type,
        service_id,
        created_at
      ) VALUES (
        p_idempotency_key,
        p_tenant_id,
        'bulk_update_services',
        NULL, -- No single service ID for bulk operations
        NOW()
      );
    END IF;

    -- 7. DETERMINE OVERALL SUCCESS STATUS
    DECLARE
      v_overall_success boolean := v_error_count = 0;
      v_partial_success boolean := v_success_count > 0 AND v_error_count > 0;
    BEGIN
      RETURN jsonb_build_object(
        'success', v_overall_success,
        'partial_success', v_partial_success,
        'data', jsonb_build_object(
          'updated_services', v_updated_services,
          'errors', v_errors,
          'summary', jsonb_build_object(
            'total_requested', jsonb_array_length(p_updates_data),
            'successful_updates', v_success_count,
            'failed_updates', v_error_count,
            'success_rate', CASE
              WHEN jsonb_array_length(p_updates_data) > 0
              THEN ROUND((v_success_count::decimal / jsonb_array_length(p_updates_data)) * 100, 2)
              ELSE 0
            END,
            'services_locked', COALESCE(array_length(v_locked_services, 1), 0)
          ),
          'operation_completed_at', NOW()
        ),
        'message', CASE
          WHEN v_overall_success THEN 'All services updated successfully'
          WHEN v_partial_success THEN 'Bulk update completed with some failures'
          ELSE 'Bulk update failed - no services updated'
        END
      );
    END;

  EXCEPTION
    WHEN OTHERS THEN
      -- TRANSACTION ROLLBACK ON CRITICAL ERROR
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Bulk update failed: ' || SQLERRM,
        'code', 'BULK_OPERATION_ERROR',
        'partial_results', jsonb_build_object(
          'processed_count', v_update_index,
          'success_count', v_success_count,
          'error_count', v_error_count
        )
      );
  END;
  $$;


ALTER FUNCTION "public"."bulk_update_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_updates_data" "jsonb", "p_idempotency_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid" DEFAULT NULL::"uuid", "p_is_live" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_channel record;
  v_duplicates jsonb := '[]'::jsonb;
  v_duplicate_contacts jsonb;
BEGIN
  -- Check each contact channel for duplicates
  FOR v_channel IN 
    SELECT * FROM jsonb_to_recordset(p_contact_channels) AS x(
      channel_type text,
      value text
    )
  LOOP
    -- Only check critical channels
    IF v_channel.channel_type IN ('mobile', 'email') THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', v_channel.channel_type,
          'value', v_channel.value,
          'existing_contact', to_jsonb(c.*)
        )
      ) INTO v_duplicate_contacts
      FROM t_contact_channels ch
      INNER JOIN t_contacts c ON ch.contact_id = c.id
      WHERE ch.channel_type = v_channel.channel_type
        AND ch.value = v_channel.value
        AND c.is_live = p_is_live
        AND c.status != 'archived'
        AND (p_exclude_contact_id IS NULL OR c.id != p_exclude_contact_id);

      IF v_duplicate_contacts IS NOT NULL THEN
        v_duplicates := v_duplicates || v_duplicate_contacts;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'hasDuplicates', jsonb_array_length(v_duplicates) > 0,
      'duplicates', v_duplicates
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'CHECK_DUPLICATES_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid", "p_is_live" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid" DEFAULT NULL::"uuid", "p_is_live" boolean DEFAULT true, "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_channel record;
  v_duplicates jsonb := '[]'::jsonb;
  v_duplicate_contacts jsonb;
  v_actual_tenant_id uuid;
BEGIN
  -- Get the tenant_id from JWT if not provided
  v_actual_tenant_id := COALESCE(
    p_tenant_id, 
    (auth.jwt() ->> 'tenant_id')::uuid,
    (SELECT tenant_id FROM t_user_profiles WHERE user_id = auth.uid() LIMIT 1)
  );

  -- Check each contact channel for duplicates
  FOR v_channel IN 
    SELECT * FROM jsonb_to_recordset(p_contact_channels) AS x(
      channel_type text,
      value text
    )
  LOOP
    -- Only check critical channels (email and mobile)
    IF v_channel.channel_type IN ('mobile', 'email') THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', v_channel.channel_type,
          'value', v_channel.value,
          'existing_contact', jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'company_name', c.company_name,
            'type', c.type,
            'status', c.status,
            'classifications', c.classifications
          )
        )
      ) INTO v_duplicate_contacts
      FROM t_contact_channels ch
      INNER JOIN t_contacts c ON ch.contact_id = c.id
      WHERE ch.channel_type = v_channel.channel_type
        AND ch.value = v_channel.value
        AND c.is_live = p_is_live
        AND c.tenant_id = v_actual_tenant_id  -- TENANT FILTER
        AND c.status != 'archived'
        AND (p_exclude_contact_id IS NULL OR c.id != p_exclude_contact_id);
      
      IF v_duplicate_contacts IS NOT NULL THEN
        v_duplicates := v_duplicates || v_duplicate_contacts;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'hasDuplicates', jsonb_array_length(v_duplicates) > 0,
      'duplicates', v_duplicates
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'CHECK_DUPLICATES_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid", "p_is_live" boolean, "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_invitation_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Auto-update status to expired if past expiry date
  IF NEW.expires_at < NOW() AND NEW.status IN ('pending', 'sent', 'resent') THEN
    NEW.status = 'expired';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_invitation_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_invitations"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE t_user_invitations
  SET status = 'expired'
  WHERE status IN ('pending', 'sent', 'resent')
  AND expires_at < NOW();
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_invitations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."copy_catalog_live_to_test"("p_tenant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_industries_copied INTEGER := 0;
  v_categories_copied INTEGER := 0;
  v_items_copied INTEGER := 0;
BEGIN
  -- First, delete existing test data
  DELETE FROM t_catalog_items WHERE tenant_id = p_tenant_id AND is_live = FALSE;
  DELETE FROM t_catalog_categories WHERE tenant_id = p_tenant_id AND is_live = FALSE;
  DELETE FROM t_catalog_industries WHERE tenant_id = p_tenant_id AND is_live = FALSE;
  
  -- Copy industries
  INSERT INTO t_catalog_industries (
    tenant_id, is_live, industry_code, name, description, icon,
    common_pricing_rules, compliance_requirements, is_custom, 
    master_industry_id, customization_notes, is_active, sort_order,
    created_by, updated_by
  )
  SELECT 
    tenant_id, FALSE, industry_code, name, description, icon,
    common_pricing_rules, compliance_requirements, is_custom,
    master_industry_id, customization_notes, is_active, sort_order,
    created_by, updated_by
  FROM t_catalog_industries 
  WHERE tenant_id = p_tenant_id AND is_live = TRUE;
  
  GET DIAGNOSTICS v_industries_copied = ROW_COUNT;
  
  -- Copy categories
  INSERT INTO t_catalog_categories (
    tenant_id, industry_id, is_live, category_code, name, description, icon,
    default_pricing_model, suggested_duration, common_variants, pricing_rule_templates,
    is_custom, master_category_id, customization_notes, is_active, sort_order,
    created_by, updated_by
  )
  SELECT 
    c.tenant_id, ti_test.id, FALSE, c.category_code, c.name, c.description, c.icon,
    c.default_pricing_model, c.suggested_duration, c.common_variants, c.pricing_rule_templates,
    c.is_custom, c.master_category_id, c.customization_notes, c.is_active, c.sort_order,
    c.created_by, c.updated_by
  FROM t_catalog_categories c
  JOIN t_catalog_industries ti_live ON c.industry_id = ti_live.id AND ti_live.is_live = TRUE
  JOIN t_catalog_industries ti_test ON ti_live.industry_code = ti_test.industry_code 
    AND ti_test.tenant_id = p_tenant_id AND ti_test.is_live = FALSE
  WHERE c.tenant_id = p_tenant_id AND c.is_live = TRUE;
  
  GET DIAGNOSTICS v_categories_copied = ROW_COUNT;
  
  -- Copy items (this is more complex due to parent-child relationships)
  -- First copy parent items, then variants
  WITH copied_items AS (
    INSERT INTO t_catalog_items (
      tenant_id, is_live, type, industry_id, category_id, name, short_description,
      description_format, description_content, terms_format, terms_content,
      parent_id, is_variant, variant_attributes, price_attributes, tax_config,
      metadata, specifications, status, created_by, updated_by
    )
    SELECT 
      i.tenant_id, FALSE, i.type, 
      CASE WHEN i.industry_id IS NOT NULL THEN ti_test.id ELSE NULL END,
      CASE WHEN i.category_id IS NOT NULL THEN tc_test.id ELSE NULL END,
      i.name, i.short_description, i.description_format, i.description_content,
      i.terms_format, i.terms_content, NULL, FALSE, i.variant_attributes,
      i.price_attributes, i.tax_config, i.metadata, i.specifications,
      i.status, i.created_by, i.updated_by
    FROM t_catalog_items i
    LEFT JOIN t_catalog_industries ti_live ON i.industry_id = ti_live.id AND ti_live.is_live = TRUE
    LEFT JOIN t_catalog_industries ti_test ON ti_live.industry_code = ti_test.industry_code 
      AND ti_test.tenant_id = p_tenant_id AND ti_test.is_live = FALSE
    LEFT JOIN t_catalog_categories tc_live ON i.category_id = tc_live.id AND tc_live.is_live = TRUE
    LEFT JOIN t_catalog_categories tc_test ON tc_live.category_code = tc_test.category_code 
      AND tc_test.tenant_id = p_tenant_id AND tc_test.is_live = FALSE
    WHERE i.tenant_id = p_tenant_id AND i.is_live = TRUE AND i.parent_id IS NULL
    RETURNING id, name
  )
  SELECT COUNT(*) FROM copied_items INTO v_items_copied;
  
  RETURN jsonb_build_object(
    'success', true,
    'industries_copied', v_industries_copied,
    'categories_copied', v_categories_copied,
    'items_copied', v_items_copied,
    'message', 'Live data successfully copied to test environment'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'message', 'Failed to copy live data to test environment'
  );
END;
$$;


ALTER FUNCTION "public"."copy_catalog_live_to_test"("p_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."copy_catalog_live_to_test"("p_tenant_id" "uuid") IS 'Copies all live catalog data to test environment for safe testing and development.';



CREATE OR REPLACE FUNCTION "public"."create_catalog_item_version"("p_current_item_id" "uuid", "p_version_reason" "text" DEFAULT 'Item updated'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_current_item RECORD;
  v_new_item_id UUID;
  v_original_item_id UUID;
  v_next_version INTEGER;
BEGIN
  -- Get current item details
  SELECT * INTO v_current_item
  FROM t_catalog_items
  WHERE id = p_current_item_id AND is_current_version = TRUE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current item not found or not current version: %', p_current_item_id;
  END IF;
  
  -- Determine original item ID
  v_original_item_id := COALESCE(v_current_item.original_item_id, p_current_item_id);
  
  -- Get next version number
  v_next_version := get_next_version_number(v_original_item_id);
  
  -- Generate new item ID
  v_new_item_id := gen_random_uuid();
  
  -- Mark current item as no longer current and set replaced_by
  UPDATE t_catalog_items 
  SET 
    is_current_version = FALSE,
    replaced_by_id = v_new_item_id,
    updated_at = NOW(),
    updated_by = auth.uid()
  WHERE id = p_current_item_id;
  
  -- Create new version (will be populated by application)
  -- This function just reserves the ID and sets up version chain
  INSERT INTO t_catalog_items (
    id,
    tenant_id,
    is_live,
    original_item_id,
    parent_version_id,
    version_number,
    is_current_version,
    version_reason,
    type,
    name,
    created_by,
    updated_by
  ) VALUES (
    v_new_item_id,
    v_current_item.tenant_id,
    v_current_item.is_live,
    v_original_item_id,
    p_current_item_id,
    v_next_version,
    TRUE,
    p_version_reason,
    v_current_item.type,
    v_current_item.name || ' (v' || v_next_version || ')', -- Temporary name
    auth.uid(),
    auth.uid()
  );
  
  RETURN v_new_item_id;
END;
$$;


ALTER FUNCTION "public"."create_catalog_item_version"("p_current_item_id" "uuid", "p_version_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_catalog_item_version"("p_current_item_id" "uuid", "p_version_reason" "text") IS 'Creates a new version of an existing catalog item. Marks old version as replaced and sets up version chain.';



CREATE OR REPLACE FUNCTION "public"."create_contact_transaction"("p_contact_data" "jsonb", "p_contact_channels" "jsonb" DEFAULT '[]'::"jsonb", "p_addresses" "jsonb" DEFAULT '[]'::"jsonb", "p_contact_persons" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_contact_id uuid;
  v_contact_record record;
  v_channel record;
  v_address record;
  v_person record;
  v_person_contact_id uuid;
  v_person_channel record;
  v_result jsonb;
BEGIN
  -- Step 1: Create main contact
  INSERT INTO t_contacts (
    type,
    status,
    name,
    company_name,
    registration_number,
    salutation,
    designation,
    department,
    is_primary_contact,
    classifications,
    tags,
    compliance_numbers,
    notes,
    parent_contact_ids,
    tenant_id,
    auth_user_id,
    t_userprofile_id,
    created_by,
    is_live
  )
  VALUES (
    (p_contact_data->>'type')::text,
    COALESCE((p_contact_data->>'status')::text, 'active'),
    (p_contact_data->>'name')::text,
    (p_contact_data->>'company_name')::text,
    (p_contact_data->>'registration_number')::text,
    (p_contact_data->>'salutation')::text,
    (p_contact_data->>'designation')::text,
    (p_contact_data->>'department')::text,
    COALESCE((p_contact_data->>'is_primary_contact')::boolean, false),
    COALESCE(p_contact_data->'classifications', '[]'::jsonb),
    COALESCE(p_contact_data->'tags', '[]'::jsonb),
    COALESCE(p_contact_data->'compliance_numbers', '[]'::jsonb),
    (p_contact_data->>'notes')::text,
    COALESCE(p_contact_data->'parent_contact_ids', '[]'::jsonb),
    (p_contact_data->>'tenant_id')::uuid,
    (p_contact_data->>'auth_user_id')::uuid,
    (p_contact_data->>'t_userprofile_id')::uuid,
    (p_contact_data->>'created_by')::uuid,
    COALESCE((p_contact_data->>'is_live')::boolean, true)
  )
  RETURNING id INTO v_contact_id;

  -- Step 2: Create contact channels
  IF jsonb_array_length(p_contact_channels) > 0 THEN
    FOR v_channel IN 
      SELECT * FROM jsonb_to_recordset(p_contact_channels) AS x(
        channel_type text,
        value text,
        country_code text,
        is_primary boolean,
        is_verified boolean,
        notes text
      )
    LOOP
      INSERT INTO t_contact_channels (
        contact_id,
        channel_type,
        value,
        country_code,
        is_primary,
        is_verified,
        notes
      )
      VALUES (
        v_contact_id,
        v_channel.channel_type,
        v_channel.value,
        v_channel.country_code,
        COALESCE(v_channel.is_primary, false),
        COALESCE(v_channel.is_verified, false),
        v_channel.notes
      );
    END LOOP;
  END IF;

  -- Step 3: Create addresses
  IF jsonb_array_length(p_addresses) > 0 THEN
    FOR v_address IN 
      SELECT * FROM jsonb_to_recordset(p_addresses) AS x(
        type text,
        address_type text,
        label text,
        address_line1 text,
        line1 text,
        address_line2 text,
        line2 text,
        city text,
        state_code text,
        state text,
        country_code text,
        country text,
        postal_code text,
        google_pin text,
        is_primary boolean,
        notes text
      )
    LOOP
      INSERT INTO t_contact_addresses (
        contact_id,
        type,
        label,
        address_line1,
        address_line2,
        city,
        state_code,
        country_code,
        postal_code,
        google_pin,
        is_primary,
        notes
      )
      VALUES (
        v_contact_id,
        COALESCE(v_address.type, v_address.address_type),
        v_address.label,
        COALESCE(v_address.address_line1, v_address.line1),
        COALESCE(v_address.address_line2, v_address.line2),
        v_address.city,
        COALESCE(v_address.state_code, v_address.state),
        COALESCE(v_address.country_code, v_address.country, 'IN'),
        v_address.postal_code,
        v_address.google_pin,
        COALESCE(v_address.is_primary, false),
        v_address.notes
      );
    END LOOP;
  END IF;

  -- Step 4: Create contact persons as separate contacts
  IF jsonb_array_length(p_contact_persons) > 0 THEN
    FOR v_person IN 
      SELECT * FROM jsonb_to_recordset(p_contact_persons) AS x(
        name text,
        salutation text,
        designation text,
        department text,
        is_primary boolean,
        notes text,
        contact_channels jsonb
      )
    LOOP
      -- Create person as separate contact
      INSERT INTO t_contacts (
        type,
        status,
        name,
        salutation,
        designation,
        department,
        is_primary_contact,
        parent_contact_ids,
        classifications,
        tags,
        compliance_numbers,
        notes,
        tenant_id,
        created_by,
        is_live
      )
      VALUES (
        'individual',
        'active',
        v_person.name,
        v_person.salutation,
        v_person.designation,
        v_person.department,
        COALESCE(v_person.is_primary, false),
        jsonb_build_array(v_contact_id),
        '["team_member"]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        v_person.notes,
        (p_contact_data->>'tenant_id')::uuid,
        (p_contact_data->>'created_by')::uuid,
        COALESCE((p_contact_data->>'is_live')::boolean, true)
      )
      RETURNING id INTO v_person_contact_id;

      -- Create contact channels for person
      IF v_person.contact_channels IS NOT NULL AND jsonb_array_length(v_person.contact_channels) > 0 THEN
        FOR v_person_channel IN 
          SELECT * FROM jsonb_to_recordset(v_person.contact_channels) AS x(
            channel_type text,
            value text,
            country_code text,
            is_primary boolean,
            is_verified boolean,
            notes text
          )
        LOOP
          INSERT INTO t_contact_channels (
            contact_id,
            channel_type,
            value,
            country_code,
            is_primary,
            is_verified,
            notes
          )
          VALUES (
            v_person_contact_id,
            v_person_channel.channel_type,
            v_person_channel.value,
            v_person_channel.country_code,
            COALESCE(v_person_channel.is_primary, false),
            COALESCE(v_person_channel.is_verified, false),
            v_person_channel.notes
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Return the complete contact with all relationships
  SELECT jsonb_build_object(
    'success', true,
    'data', to_jsonb(c.*),
    'message', 'Contact created successfully'
  ) INTO v_result
  FROM t_contacts c
  WHERE c.id = v_contact_id;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'CREATE_CONTACT_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."create_contact_transaction"("p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_service_catalog_item"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_service_data" "jsonb", "p_idempotency_key" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_service_id uuid;
    v_result jsonb;
    v_resource record;
    v_pricing_type_exists boolean;
    v_service_status_exists boolean;
    v_existing_service_id uuid;
  BEGIN
    -- 1. IDEMPOTENCY CHECK
    IF p_idempotency_key IS NOT NULL THEN
      SELECT service_id INTO v_existing_service_id
      FROM t_idempotency_keys
      WHERE idempotency_key = p_idempotency_key
        AND tenant_id = p_tenant_id
        AND operation_type = 'create_service'
        AND created_at > NOW() - INTERVAL '24 hours';

      IF FOUND THEN
        -- Return existing service
        SELECT jsonb_build_object(
          'success', true,
          'data', (SELECT get_service_catalog_item(v_existing_service_id, p_tenant_id, p_is_live)),
          'message', 'Service already created (idempotency)'
        ) INTO v_result;
        RETURN v_result;
      END IF;
    END IF;

    -- 2. VALIDATE INPUT PARAMETERS
    IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'tenant_id and user_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    IF p_service_data->>'name' IS NULL OR trim(p_service_data->>'name') = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service name is required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 3. VALIDATE MASTER DATA REFERENCES
    -- Check pricing_type_id exists in product master data
    IF p_service_data->'price_attributes'->>'pricing_type_id' IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM m_category_details cd
        JOIN m_category_master cm ON cd.category_id = cm.id
        WHERE cd.id = (p_service_data->'price_attributes'->>'pricing_type_id')::uuid
          AND cm.category_name = 'pricing_types'
          AND cd.is_active = true
      ) INTO v_pricing_type_exists;

      IF NOT v_pricing_type_exists THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Invalid pricing_type_id',
          'code', 'INVALID_REFERENCE'
        );
      END IF;
    END IF;

    -- Check service_status_id exists in product master data
    IF p_service_data->'service_attributes'->>'service_status_id' IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM m_category_details cd
        JOIN m_category_master cm ON cd.category_id = cm.id
        WHERE cd.id = (p_service_data->'service_attributes'->>'service_status_id')::uuid
          AND cm.category_name = 'service_statuses'
          AND cd.is_active = true
      ) INTO v_service_status_exists;

      IF NOT v_service_status_exists THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Invalid service_status_id',
          'code', 'INVALID_REFERENCE'
        );
      END IF;
    END IF;

    -- 4. CHECK FOR DUPLICATE SERVICE NAME
    IF EXISTS(
      SELECT 1 FROM t_catalog_items
      WHERE tenant_id = p_tenant_id
        AND is_live = p_is_live
        AND LOWER(name) = LOWER(trim(p_service_data->>'name'))
        AND status != 'archived'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service with this name already exists',
        'code', 'DUPLICATE_NAME'
      );
    END IF;

    -- 5. INSERT SERVICE WITH EXPLICIT FIELD MAPPING
    INSERT INTO t_catalog_items (
      tenant_id,
      name,
      short_description,
      description_content,
      description_format,
      type,
      industry_id,
      category_id,
      status,
      is_live,
      price_attributes,
      tax_config,
      service_attributes,
      resource_requirements,
      specifications,
      terms_content,
      terms_format,
      variant_attributes,
      metadata,
      created_by,
      updated_by
    ) VALUES (
      p_tenant_id,
      trim(p_service_data->>'name'),
      p_service_data->>'short_description',
      p_service_data->>'description_content',
      COALESCE(p_service_data->>'description_format', 'markdown'),
      COALESCE(p_service_data->>'type', 'service'),
      p_service_data->>'industry_id',
      p_service_data->>'category_id',
      COALESCE(p_service_data->>'status', 'draft'),
      p_is_live,
      COALESCE(p_service_data->'price_attributes', '{}'::jsonb),
      COALESCE(p_service_data->'tax_config', '{}'::jsonb),
      COALESCE(p_service_data->'service_attributes', '{}'::jsonb),
      COALESCE(p_service_data->'resource_requirements', '{}'::jsonb),
      COALESCE(p_service_data->'specifications', '{}'::jsonb),
      p_service_data->>'terms_content',
      COALESCE(p_service_data->>'terms_format', 'markdown'),
      COALESCE(p_service_data->'variant_attributes', '{}'::jsonb),
      COALESCE(p_service_data->'metadata', '{}'::jsonb),
      p_user_id,
      p_user_id
    ) RETURNING id INTO v_service_id;

    -- 6. SAFE RESOURCE ASSOCIATION HANDLING
    -- Only process resources if explicitly provided
    IF p_service_data->'resources' IS NOT NULL AND jsonb_array_length(p_service_data->'resources') > 0 THEN
      FOR v_resource IN
        SELECT * FROM jsonb_to_recordset(p_service_data->'resources') AS x(
          resource_type_id varchar(50),
          allocation_type_id uuid,
          quantity_required integer,
          duration_hours decimal(5,2),
          unit_cost decimal(15,4),
          currency_code varchar(3),
          required_skills jsonb,
          required_attributes jsonb
        )
      LOOP
        -- Validate resource_type_id exists
        IF NOT EXISTS(SELECT 1 FROM m_catalog_resource_types WHERE id = v_resource.resource_type_id AND is_active = true) THEN
          -- Rollback and return error
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid resource_type_id: ' || v_resource.resource_type_id,
            'code', 'INVALID_RESOURCE_TYPE'
          );
        END IF;

        -- Insert service-resource relationship
        INSERT INTO t_catalog_service_resources (
          service_id,
          resource_type_id,
          tenant_id,
          allocation_type_id,
          quantity_required,
          duration_hours,
          unit_cost,
          currency_code,
          required_skills,
          required_attributes
        ) VALUES (
          v_service_id,
          v_resource.resource_type_id,
          p_tenant_id,
          v_resource.allocation_type_id,
          COALESCE(v_resource.quantity_required, 1),
          v_resource.duration_hours,
          v_resource.unit_cost,
          COALESCE(v_resource.currency_code, 'INR'),
          COALESCE(v_resource.required_skills, '[]'::jsonb),
          COALESCE(v_resource.required_attributes, '{}'::jsonb)
        );
      END LOOP;
    END IF;

    -- 7. STORE IDEMPOTENCY KEY
    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO t_idempotency_keys (
        idempotency_key,
        tenant_id,
        operation_type,
        service_id,
        created_at
      ) VALUES (
        p_idempotency_key,
        p_tenant_id,
        'create_service',
        v_service_id,
        NOW()
      );
    END IF;

    -- 8. EXPLICIT FIELD SELECTION FOR RESPONSE
    SELECT jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'short_description', s.short_description,
      'description_content', s.description_content,
      'description_format', s.description_format,
      'type', s.type,
      'industry_id', s.industry_id,
      'category_id', s.category_id,
      'status', s.status,
      'is_live', s.is_live,
      'price_attributes', s.price_attributes,
      'tax_config', s.tax_config,
      'service_attributes', s.service_attributes,
      'resource_requirements', s.resource_requirements,
      'specifications', s.specifications,
      'terms_content', s.terms_content,
      'terms_format', s.terms_format,
      'variant_attributes', s.variant_attributes,
      'metadata', s.metadata,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'created_by', s.created_by,
      'updated_by', s.updated_by,
      -- Include master data display values
      'industry_display', i.name,
      'category_display', c.name,
      'pricing_type_display', pt.display_name,
      'service_status_display', ss.display_name,
      -- Include resource count
      'resource_count', COALESCE(
        (SELECT COUNT(*) FROM t_catalog_service_resources WHERE service_id = s.id),
        0
      )
    ) INTO v_result
    FROM t_catalog_items s
    LEFT JOIN m_catalog_industries i ON s.industry_id = i.id
    LEFT JOIN m_catalog_categories c ON s.category_id = c.id
    LEFT JOIN m_category_details pt ON (s.price_attributes->>'pricing_type_id')::uuid = pt.id
    LEFT JOIN m_category_details ss ON (s.service_attributes->>'service_status_id')::uuid = ss.id
    WHERE s.id = v_service_id;

    -- 9. SUCCESS RESPONSE
    RETURN jsonb_build_object(
      'success', true,
      'data', v_result,
      'message', 'Service created successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."create_service_catalog_item"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_service_data" "jsonb", "p_idempotency_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean DEFAULT false, "p_is_live" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_existing_contact record;
  v_has_relations boolean := false;
BEGIN
  -- Check if contact exists
  SELECT * INTO v_existing_contact
  FROM t_contacts
  WHERE id = p_contact_id AND is_live = p_is_live;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Contact not found',
      'code', 'CONTACT_NOT_FOUND'
    );
  END IF;

  -- Check for active relations if not forcing
  IF NOT p_force THEN
    -- Check if this contact has children
    SELECT EXISTS(
      SELECT 1 FROM t_contacts 
      WHERE parent_contact_ids @> jsonb_build_array(p_contact_id)
        AND status != 'archived'
        AND is_live = p_is_live
    ) INTO v_has_relations;

    IF v_has_relations THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot delete contact with active relations',
        'code', 'CONTACT_HAS_RELATIONS'
      );
    END IF;
  END IF;

  -- Archive the contact
  UPDATE t_contacts 
  SET status = 'archived', updated_at = CURRENT_TIMESTAMP
  WHERE id = p_contact_id;

  -- If forcing, also archive all child contacts
  IF p_force THEN
    UPDATE t_contacts 
    SET status = 'archived', updated_at = CURRENT_TIMESTAMP
    WHERE parent_contact_ids @> jsonb_build_array(p_contact_id)
      AND is_live = p_is_live;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Contact deleted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'DELETE_CONTACT_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean, "p_is_live" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean DEFAULT false, "p_is_live" boolean DEFAULT true, "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_existing_contact record;
  v_has_relations boolean := false;
  v_actual_tenant_id uuid;
BEGIN
  -- Get the tenant_id from JWT if not provided
  v_actual_tenant_id := COALESCE(
    p_tenant_id, 
    (auth.jwt() ->> 'tenant_id')::uuid,
    (SELECT tenant_id FROM t_user_profiles WHERE user_id = auth.uid() LIMIT 1)
  );

  -- Check if contact exists and belongs to tenant
  SELECT * INTO v_existing_contact
  FROM t_contacts
  WHERE id = p_contact_id 
    AND is_live = p_is_live
    AND tenant_id = v_actual_tenant_id;  -- TENANT CHECK

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Contact not found or access denied',
      'code', 'CONTACT_NOT_FOUND'
    );
  END IF;

  -- Check for active relations if not forcing
  IF NOT p_force THEN
    -- Check if this contact has children
    SELECT EXISTS(
      SELECT 1 FROM t_contacts 
      WHERE parent_contact_ids @> jsonb_build_array(p_contact_id)
        AND status != 'archived'
        AND is_live = p_is_live
        AND tenant_id = v_actual_tenant_id  -- TENANT CHECK
    ) INTO v_has_relations;
    
    IF v_has_relations THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot delete contact with active relations',
        'code', 'CONTACT_HAS_RELATIONS'
      );
    END IF;
  END IF;

  -- Archive the contact (only if it belongs to the tenant)
  UPDATE t_contacts 
  SET status = 'archived', updated_at = CURRENT_TIMESTAMP
  WHERE id = p_contact_id
    AND tenant_id = v_actual_tenant_id;  -- TENANT CHECK

  -- If forcing, also archive all child contacts
  IF p_force THEN
    UPDATE t_contacts 
    SET status = 'archived', updated_at = CURRENT_TIMESTAMP
    WHERE parent_contact_ids @> jsonb_build_array(p_contact_id)
      AND is_live = p_is_live
      AND tenant_id = v_actual_tenant_id;  -- TENANT CHECK
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Contact deleted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'DELETE_CONTACT_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean, "p_is_live" boolean, "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_idempotency_key" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_existing_service record;
    v_result jsonb;
    v_existing_operation_id uuid;
    v_dependent_contracts integer := 0;
    v_dependent_invoices integer := 0;
    v_archive_data jsonb;
  BEGIN
    -- 1. IDEMPOTENCY CHECK
    IF p_idempotency_key IS NOT NULL THEN
      SELECT service_id INTO v_existing_operation_id
      FROM t_idempotency_keys
      WHERE idempotency_key = p_idempotency_key
        AND tenant_id = p_tenant_id
        AND operation_type = 'delete_service'
        AND created_at > NOW() - INTERVAL '24 hours';

      IF FOUND THEN
        -- Return success for idempotent delete
        RETURN jsonb_build_object(
          'success', true,
          'message', 'Service already deleted (idempotency)',
          'data', jsonb_build_object('id', v_existing_operation_id, 'status', 'archived')
        );
      END IF;
    END IF;

    -- 2. VALIDATE INPUT PARAMETERS
    IF p_service_id IS NULL OR p_tenant_id IS NULL OR p_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'service_id, tenant_id, and user_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 3. TRANSACTION START WITH ROW-LEVEL LOCKING
    -- Lock the service record for update to prevent race conditions
    SELECT * INTO v_existing_service
    FROM t_catalog_items
    WHERE id = p_service_id
      AND tenant_id = p_tenant_id
      AND is_live = p_is_live
    FOR UPDATE NOWAIT;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service not found or access denied',
        'code', 'RECORD_NOT_FOUND'
      );
    END IF;

    -- 4. CHECK IF ALREADY ARCHIVED
    IF v_existing_service.status = 'archived' THEN
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Service already archived',
        'data', jsonb_build_object(
          'id', p_service_id,
          'name', v_existing_service.name,
          'status', 'archived'
        )
      );
    END IF;

    -- 5. CHECK FOR DEPENDENCIES (Business Logic)
    -- Check if service is used in active contracts
    SELECT COUNT(*) INTO v_dependent_contracts
    FROM t_contract_items ci
    JOIN t_contracts c ON ci.contract_id = c.id
    WHERE ci.catalog_item_id = p_service_id
      AND c.tenant_id = p_tenant_id
      AND c.is_live = p_is_live
      AND c.status NOT IN ('cancelled', 'completed');

    -- Check if service is used in invoices
    SELECT COUNT(*) INTO v_dependent_invoices
    FROM t_invoice_items ii
    JOIN t_invoices i ON ii.invoice_id = i.id
    WHERE ii.catalog_item_id = p_service_id
      AND i.tenant_id = p_tenant_id
      AND i.is_live = p_is_live
      AND i.status NOT IN ('cancelled', 'void');

    -- 6. PREVENT DELETION IF ACTIVE DEPENDENCIES EXIST
    IF v_dependent_contracts > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot delete service: ' || v_dependent_contracts || ' active contracts depend on this service',
        'code', 'DEPENDENCY_EXISTS',
        'dependencies', jsonb_build_object(
          'active_contracts', v_dependent_contracts,
          'active_invoices', v_dependent_invoices
        )
      );
    END IF;

    IF v_dependent_invoices > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot delete service: ' || v_dependent_invoices || ' invoices reference this service',
        'code', 'DEPENDENCY_EXISTS',
        'dependencies', jsonb_build_object(
          'active_contracts', v_dependent_contracts,
          'active_invoices', v_dependent_invoices
        )
      );
    END IF;

    -- 7. PREPARE ARCHIVE DATA FOR AUDIT TRAIL
    SELECT jsonb_build_object(
      'deleted_at', NOW(),
      'deleted_by', p_user_id,
      'original_status', v_existing_service.status,
      'deletion_reason', 'Manual deletion via API',
      'had_dependencies', jsonb_build_object(
        'contracts', v_dependent_contracts,
        'invoices', v_dependent_invoices
      )
    ) INTO v_archive_data;

    -- 8. SOFT DELETE - ARCHIVE THE SERVICE
    UPDATE t_catalog_items SET
      status = 'archived',
      updated_by = p_user_id,
      updated_at = NOW(),
      -- Store deletion metadata in metadata field
      metadata = metadata || v_archive_data
    WHERE id = p_service_id
      AND tenant_id = p_tenant_id
      AND is_live = p_is_live;

    -- 9. SOFT DELETE ASSOCIATED RESOURCES (Don't hard delete)
    UPDATE t_catalog_service_resources SET
      is_active = false,
      updated_at = NOW()
    WHERE service_id = p_service_id
      AND tenant_id = p_tenant_id
      AND is_active = true;

    -- 10. STORE IDEMPOTENCY KEY
    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO t_idempotency_keys (
        idempotency_key,
        tenant_id,
        operation_type,
        service_id,
        created_at
      ) VALUES (
        p_idempotency_key,
        p_tenant_id,
        'delete_service',
        p_service_id,
        NOW()
      );
    END IF;

    -- 11. PREPARE SUCCESS RESPONSE
    SELECT jsonb_build_object(
      'id', p_service_id,
      'name', v_existing_service.name,
      'previous_status', v_existing_service.status,
      'current_status', 'archived',
      'deleted_at', NOW(),
      'deleted_by', p_user_id,
      'resources_archived', (
        SELECT COUNT(*)
        FROM t_catalog_service_resources
        WHERE service_id = p_service_id
          AND tenant_id = p_tenant_id
          AND is_active = false
      )
    ) INTO v_result;

    -- 12. SUCCESS RESPONSE
    RETURN jsonb_build_object(
      'success', true,
      'data', v_result,
      'message', 'Service archived successfully'
    );

  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service is being updated by another user. Please try again.',
        'code', 'CONCURRENT_UPDATE'
      );
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING WITH ROLLBACK
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."delete_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_idempotency_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_single_default_tax_rate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- If setting this rate as default, unset all other defaults for this tenant
  IF NEW.is_default = true AND NEW.is_active = true THEN
    UPDATE t_tax_rates 
    SET is_default = false, updated_at = NOW()
    WHERE tenant_id = NEW.tenant_id 
      AND id != NEW.id 
      AND is_default = true 
      AND is_active = true;
  END IF;
  
  -- If deactivating the default rate, ensure there's still a default
  IF NEW.is_active = false AND OLD.is_default = true THEN
    -- Try to set another active rate as default
    UPDATE t_tax_rates 
    SET is_default = true, updated_at = NOW()
    WHERE tenant_id = NEW.tenant_id 
      AND id != NEW.id 
      AND is_active = true
      AND id = (
        SELECT id FROM t_tax_rates 
        WHERE tenant_id = NEW.tenant_id 
          AND is_active = true 
          AND id != NEW.id
        ORDER BY sequence_no ASC 
        LIMIT 1
      );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_single_default_tax_rate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_single_primary_auth_method"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE t_user_auth_methods 
    SET is_primary = false 
    WHERE user_id = NEW.user_id 
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_single_primary_auth_method"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_master_categories"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_categories jsonb;
  BEGIN
    -- GET ALL ACTIVE MASTER CATEGORIES FOR UI DROPDOWNS
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', cm.id,
        'category_name', cm.category_name,
        'display_name', cm.display_name,
        'description', cm.description,
        'icon_name', cm.icon_name,
        'order_sequence', cm.order_sequence,
        'total_active_details', COALESCE(
          (SELECT COUNT(*) FROM m_category_details cd
           WHERE cd.category_id = cm.id AND cd.is_active = true),
          0
        )
      ) ORDER BY cm.order_sequence, cm.display_name
    ) INTO v_categories
    FROM m_category_master cm
    WHERE cm.is_active = true;

    -- SUCCESS RESPONSE
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'categories', COALESCE(v_categories, '[]'::jsonb),
        'total_categories', COALESCE(jsonb_array_length(v_categories), 0)
      ),
      'message', 'Master categories retrieved successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."get_all_master_categories"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_resources"("p_tenant_id" "uuid", "p_is_live" boolean, "p_resource_type" character varying DEFAULT NULL::character varying, "p_filters" "jsonb" DEFAULT '{}'::"jsonb", "p_page" integer DEFAULT 1, "p_limit" integer DEFAULT 20) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
  DECLARE
    v_offset integer;
    v_total_count integer;
    v_resources jsonb;
    v_where_conditions text[] := ARRAY['r.tenant_id = $1', 'r.is_live = $2'];
    v_order_by text := 'ORDER BY r.name ASC';
    v_query text;
    v_count_query text;
    v_search_term text;
  BEGIN
    -- 1. VALIDATE INPUT PARAMETERS
    IF p_tenant_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'tenant_id is required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 2. VALIDATE AND SET PAGINATION
    v_offset := GREATEST((p_page - 1) * p_limit, 0);

    -- Limit the page size to prevent abuse
    IF p_limit > 100 THEN
      p_limit := 100;
    ELSIF p_limit < 1 THEN
      p_limit := 20;
    END IF;

    -- 3. BUILD DYNAMIC WHERE CONDITIONS SAFELY
    -- Resource type filter
    IF p_resource_type IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['r.resource_type_id = ''' || replace(p_resource_type, '''', '''''') || ''''];
    END IF;

    -- Status filter
    IF p_filters->>'status' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['r.status = ''' || replace(p_filters->>'status', '''', '''''') || ''''];
    ELSE
      -- Default to active resources only
      v_where_conditions := v_where_conditions || ARRAY['r.status = ''active'''];
    END IF;

    -- Availability filter
    IF p_filters->>'available_only' IS NOT NULL AND p_filters->>'available_only' = 'true' THEN
      v_where_conditions := v_where_conditions || ARRAY['r.is_available = true'];
    END IF;

    -- Skills filter (check if resource has any of the required skills)
    IF p_filters->>'required_skills' IS NOT NULL AND p_filters->>'required_skills' != '[]' THEN
      v_where_conditions := v_where_conditions || ARRAY['r.skills ?| ARRAY[' ||
        (SELECT string_agg('''' || replace(value::text, '''', '''''') || '''', ',')
         FROM jsonb_array_elements_text(p_filters->'required_skills')) || ']'];
    END IF;

    -- Location filter
    IF p_filters->>'location_id' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['r.location_id = ''' || replace(p_filters->>'location_id', '''', '''''') ||
  '''::uuid'];
    END IF;

    -- Mobile resources filter
    IF p_filters->>'mobile_only' IS NOT NULL AND p_filters->>'mobile_only' = 'true' THEN
      v_where_conditions := v_where_conditions || ARRAY['r.is_mobile = true'];
    END IF;

    -- Cost range filters
    IF p_filters->>'min_hourly_cost' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['r.hourly_cost >= ' || (p_filters->>'min_hourly_cost')::numeric];
    END IF;

    IF p_filters->>'max_hourly_cost' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['r.hourly_cost <= ' || (p_filters->>'max_hourly_cost')::numeric];
    END IF;

    -- Capacity filters
    IF p_filters->>'min_capacity_per_day' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['r.capacity_per_day >= ' || (p_filters->>'min_capacity_per_day')::integer];
    END IF;

    -- Search functionality (case-insensitive)
    IF p_filters->>'search' IS NOT NULL AND trim(p_filters->>'search') != '' THEN
      v_search_term := '%' || lower(trim(p_filters->>'search')) || '%';
      v_where_conditions := v_where_conditions || ARRAY['(
        lower(r.name) LIKE ''' || replace(v_search_term, '''', '''''') || ''' OR
        lower(r.description) LIKE ''' || replace(v_search_term, '''', '''''') || '''
      )'];
    END IF;

    -- 4. BUILD SORTING
    IF p_filters->>'sort_by' IS NOT NULL THEN
      CASE p_filters->>'sort_by'
        WHEN 'name' THEN
          v_order_by := 'ORDER BY r.name ' || COALESCE(p_filters->>'sort_order', 'ASC');
        WHEN 'hourly_cost' THEN
          v_order_by := 'ORDER BY r.hourly_cost ' || COALESCE(p_filters->>'sort_order', 'ASC');
        WHEN 'capacity_per_day' THEN
          v_order_by := 'ORDER BY r.capacity_per_day ' || COALESCE(p_filters->>'sort_order', 'DESC');
        WHEN 'created_at' THEN
          v_order_by := 'ORDER BY r.created_at ' || COALESCE(p_filters->>'sort_order', 'DESC');
        ELSE
          v_order_by := 'ORDER BY r.name ASC';
      END CASE;
    END IF;

    -- 5. GET TOTAL COUNT
    v_count_query := 'SELECT COUNT(*) FROM t_catalog_resources r WHERE ' || array_to_string(v_where_conditions, ' AND ');

    EXECUTE v_count_query USING p_tenant_id, p_is_live INTO v_total_count;

    -- 6. GET RESOURCES WITH EXPLICIT FIELD SELECTION AND MASTER DATA LOOKUPS
    v_query := '
      SELECT jsonb_agg(
        jsonb_build_object(
          ''id'', r.id,
          ''name'', r.name,
          ''description'', r.description,
          ''resource_type_id'', r.resource_type_id,
          ''resource_type_display'', rt.name,
          ''resource_type_icon'', rt.icon,
          ''is_available'', r.is_available,
          ''capacity_per_day'', r.capacity_per_day,
          ''capacity_per_hour'', r.capacity_per_hour,
          ''working_hours'', r.working_hours,
          ''skills'', r.skills,
          ''attributes'', r.attributes,
          ''location_id'', r.location_id,
          ''is_mobile'', r.is_mobile,
          ''service_radius_km'', r.service_radius_km,
          ''hourly_cost'', r.hourly_cost,
          ''daily_cost'', r.daily_cost,
          ''currency_code'', r.currency_code,
          ''status'', r.status,
          ''created_at'', r.created_at,
          ''updated_at'', r.updated_at,
          ''created_by'', r.created_by,
          ''updated_by'', r.updated_by,
          -- Computed fields
          ''skills_count'', COALESCE(jsonb_array_length(r.skills), 0),
          ''current_utilization'', COALESCE(
            (SELECT COUNT(*) FROM t_catalog_service_resources sr
             WHERE sr.resource_type_id = r.resource_type_id
               AND sr.tenant_id = r.tenant_id
               AND sr.is_active = true),
            0
          ),
          ''pricing_models'', COALESCE(
            (SELECT jsonb_agg(
               jsonb_build_object(
                 ''pricing_type_id'', rp.pricing_type_id,
                 ''base_rate'', rp.base_rate,
                 ''currency_code'', rp.currency_code,
                 ''effective_from'', rp.effective_from,
                 ''effective_to'', rp.effective_to
               )
             )
             FROM t_catalog_resource_pricing rp
             WHERE rp.resource_id = r.id
               AND rp.is_active = true
               AND (rp.effective_to IS NULL OR rp.effective_to >= CURRENT_DATE)
            ),
            ''[]''::jsonb
          )
        ) ORDER BY ' ||
        CASE
          WHEN p_filters->>'sort_by' = 'name' THEN 'r.name ' || COALESCE(p_filters->>'sort_order', 'ASC')
          WHEN p_filters->>'sort_by' = 'hourly_cost' THEN 'r.hourly_cost ' || COALESCE(p_filters->>'sort_order', 'ASC')
          WHEN p_filters->>'sort_by' = 'capacity_per_day' THEN 'r.capacity_per_day ' || COALESCE(p_filters->>'sort_order', 'DESC')
          ELSE 'r.name ASC'
        END || '
      ) FROM (
        SELECT r.*
        FROM t_catalog_resources r
        LEFT JOIN m_catalog_resource_types rt ON r.resource_type_id = rt.id
        WHERE ' || array_to_string(v_where_conditions, ' AND ') || '
        ' || v_order_by || '
        LIMIT ' || p_limit || ' OFFSET ' || v_offset || '
      ) r
      LEFT JOIN m_catalog_resource_types rt ON r.resource_type_id = rt.id
    ';

    EXECUTE v_query USING p_tenant_id, p_is_live INTO v_resources;

    -- 7. SUCCESS RESPONSE WITH PAGINATION AND SUMMARY INFO
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'resources', COALESCE(v_resources, '[]'::jsonb),
        'summary', jsonb_build_object(
          'total_resources', v_total_count,
          'available_resources', (
            SELECT COUNT(*) FROM t_catalog_resources r
            WHERE r.tenant_id = p_tenant_id
              AND r.is_live = p_is_live
              AND r.status = 'active'
              AND r.is_available = true
          ),
          'resource_types', (
            SELECT jsonb_agg(DISTINCT r.resource_type_id)
            FROM t_catalog_resources r
            WHERE r.tenant_id = p_tenant_id
              AND r.is_live = p_is_live
              AND r.status = 'active'
          )
        )
      ),
      'pagination', jsonb_build_object(
        'page', p_page,
        'limit', p_limit,
        'total', v_total_count,
        'pages', CEILING(v_total_count::decimal / p_limit),
        'has_next', (p_page * p_limit) < v_total_count,
        'has_prev', p_page > 1
      ),
      'filters_applied', p_filters,
      'message', 'Resources retrieved successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $_$;


ALTER FUNCTION "public"."get_available_resources"("p_tenant_id" "uuid", "p_is_live" boolean, "p_resource_type" character varying, "p_filters" "jsonb", "p_page" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_catalog_item_history"("p_item_id" "uuid") RETURNS TABLE("version_id" "uuid", "version_number" integer, "version_reason" "text", "created_at" timestamp with time zone, "created_by" "uuid", "is_current" boolean, "price_at_version" "jsonb", "name_at_version" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_original_item_id UUID;
BEGIN
  -- Get original item ID
  SELECT COALESCE(original_item_id, id) INTO v_original_item_id
  FROM t_catalog_items
  WHERE id = p_item_id;
  
  -- Return version history
  RETURN QUERY
  SELECT 
    ci.id,
    ci.version_number,
    ci.version_reason,
    ci.created_at,
    ci.created_by,
    ci.is_current_version,
    ci.price_attributes,
    ci.name
  FROM t_catalog_items ci
  WHERE ci.original_item_id = v_original_item_id OR ci.id = v_original_item_id
  ORDER BY ci.version_number DESC;
END;
$$;


ALTER FUNCTION "public"."get_catalog_item_history"("p_item_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_catalog_item_history"("p_item_id" "uuid") IS 'Returns complete version history for a catalog item including change tracking.';



CREATE OR REPLACE FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_contact jsonb;
  v_channels jsonb;
  v_addresses jsonb;
  v_contact_persons jsonb;
  v_parent_contacts jsonb;
  v_result jsonb;
BEGIN
  -- Get main contact
  SELECT to_jsonb(c.*) INTO v_contact
  FROM t_contacts c
  WHERE c.id = p_contact_id AND c.is_live = p_is_live;

  IF v_contact IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Contact not found',
      'code', 'CONTACT_NOT_FOUND'
    );
  END IF;

  -- Get contact channels
  SELECT COALESCE(jsonb_agg(to_jsonb(ch.*)), '[]'::jsonb) INTO v_channels
  FROM t_contact_channels ch
  WHERE ch.contact_id = p_contact_id;

  -- Get addresses with explicit field selection (FIXED)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', addr.id,
      'type', addr.type,
      'label', addr.label,
      'address_line1', addr.address_line1,
      'address_line2', addr.address_line2,
      'city', addr.city,
      'state_code', addr.state_code,
      'country_code', addr.country_code,
      'postal_code', addr.postal_code,
      'google_pin', addr.google_pin,
      'is_primary', addr.is_primary,
      'notes', addr.notes,
      'created_at', addr.created_at,
      'updated_at', addr.updated_at
    )
  ), '[]'::jsonb) INTO v_addresses
  FROM t_contact_addresses addr
  WHERE addr.contact_id = p_contact_id;

  -- Get contact persons (children)
  SELECT COALESCE(jsonb_agg(
    to_jsonb(cp.*) || jsonb_build_object(
      'contact_channels', COALESCE(cp_channels.channels, '[]'::jsonb)
    )
  ), '[]'::jsonb) INTO v_contact_persons
  FROM t_contacts cp
  LEFT JOIN (
    SELECT 
      contact_id,
      jsonb_agg(to_jsonb(ch.*)) as channels
    FROM t_contact_channels ch
    GROUP BY contact_id
  ) cp_channels ON cp.id = cp_channels.contact_id
  WHERE cp.parent_contact_ids @> jsonb_build_array(p_contact_id)
    AND cp.is_live = p_is_live;

  -- Get parent contacts if any
  IF (v_contact->'parent_contact_ids')::jsonb != '[]'::jsonb THEN
    SELECT COALESCE(jsonb_agg(
      to_jsonb(pc.*) || jsonb_build_object(
        'contact_channels', COALESCE(pc_channels.channels, '[]'::jsonb),
        'contact_addresses', COALESCE(pc_addresses.addresses, '[]'::jsonb)
      )
    ), '[]'::jsonb) INTO v_parent_contacts
    FROM t_contacts pc
    LEFT JOIN (
      SELECT 
        contact_id,
        jsonb_agg(to_jsonb(ch.*)) as channels
      FROM t_contact_channels ch
      GROUP BY contact_id
    ) pc_channels ON pc.id = pc_channels.contact_id
    LEFT JOIN (
      SELECT 
        contact_id,
        jsonb_agg(to_jsonb(addr.*)) as addresses
      FROM t_contact_addresses addr
      GROUP BY contact_id
    ) pc_addresses ON pc.id = pc_addresses.contact_id
    WHERE pc.id IN (
      SELECT jsonb_array_elements_text(v_contact->'parent_contact_ids')::uuid
    ) AND pc.is_live = p_is_live;
  ELSE
    v_parent_contacts := '[]'::jsonb;
  END IF;

  -- Combine all data
  SELECT 
    v_contact || 
    jsonb_build_object(
      'contact_channels', v_channels,
      'contact_addresses', v_addresses,
      'addresses', v_addresses,
      'contact_persons', v_contact_persons,
      'parent_contacts', v_parent_contacts
    ) INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result,
    'message', 'Contact retrieved successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'GET_CONTACT_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean DEFAULT true, "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_contact jsonb;
  v_channels jsonb;
  v_addresses jsonb;
  v_contact_persons jsonb;
  v_parent_contacts jsonb;
  v_result jsonb;
  v_actual_tenant_id uuid;
BEGIN
  -- Get the tenant_id from JWT if not provided
  v_actual_tenant_id := COALESCE(
    p_tenant_id, 
    (auth.jwt() ->> 'tenant_id')::uuid,
    (SELECT tenant_id FROM t_user_profiles WHERE user_id = auth.uid() LIMIT 1)
  );

  -- Get main contact WITH TENANT CHECK
  SELECT to_jsonb(c.*) INTO v_contact
  FROM t_contacts c
  WHERE c.id = p_contact_id 
    AND c.is_live = p_is_live
    AND c.tenant_id = v_actual_tenant_id;  -- TENANT FILTER

  IF v_contact IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Contact not found or access denied',
      'code', 'CONTACT_NOT_FOUND'
    );
  END IF;

  -- Get contact channels
  SELECT COALESCE(jsonb_agg(to_jsonb(ch.*)), '[]'::jsonb) INTO v_channels
  FROM t_contact_channels ch
  WHERE ch.contact_id = p_contact_id;

  -- Get addresses with explicit field selection
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', addr.id,
      'type', addr.type,
      'label', addr.label,
      'address_line1', addr.address_line1,
      'address_line2', addr.address_line2,
      'city', addr.city,
      'state_code', addr.state_code,
      'country_code', addr.country_code,
      'postal_code', addr.postal_code,
      'google_pin', addr.google_pin,
      'is_primary', addr.is_primary,
      'notes', addr.notes,
      'created_at', addr.created_at,
      'updated_at', addr.updated_at
    )
  ), '[]'::jsonb) INTO v_addresses
  FROM t_contact_addresses addr
  WHERE addr.contact_id = p_contact_id;

  -- Get contact persons (children) WITH TENANT CHECK
  SELECT COALESCE(jsonb_agg(
    to_jsonb(cp.*) || jsonb_build_object(
      'contact_channels', COALESCE(cp_channels.channels, '[]'::jsonb)
    )
  ), '[]'::jsonb) INTO v_contact_persons
  FROM t_contacts cp
  LEFT JOIN (
    SELECT 
      contact_id,
      jsonb_agg(to_jsonb(ch.*)) as channels
    FROM t_contact_channels ch
    GROUP BY contact_id
  ) cp_channels ON cp.id = cp_channels.contact_id
  WHERE cp.parent_contact_ids @> jsonb_build_array(p_contact_id)
    AND cp.is_live = p_is_live
    AND cp.tenant_id = v_actual_tenant_id;  -- TENANT FILTER

  -- Get parent contacts if any WITH TENANT CHECK
  IF (v_contact->'parent_contact_ids')::jsonb != '[]'::jsonb AND 
     (v_contact->'parent_contact_ids') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      to_jsonb(pc.*) || jsonb_build_object(
        'contact_channels', COALESCE(pc_channels.channels, '[]'::jsonb),
        'contact_addresses', COALESCE(pc_addresses.addresses, '[]'::jsonb)
      )
    ), '[]'::jsonb) INTO v_parent_contacts
    FROM t_contacts pc
    LEFT JOIN (
      SELECT 
        contact_id,
        jsonb_agg(to_jsonb(ch.*)) as channels
      FROM t_contact_channels ch
      GROUP BY contact_id
    ) pc_channels ON pc.id = pc_channels.contact_id
    LEFT JOIN (
      SELECT 
        contact_id,
        jsonb_agg(to_jsonb(addr.*)) as addresses
      FROM t_contact_addresses addr
      GROUP BY contact_id
    ) pc_addresses ON pc.id = pc_addresses.contact_id
    WHERE pc.id IN (
      SELECT jsonb_array_elements_text(v_contact->'parent_contact_ids')::uuid
    ) 
    AND pc.is_live = p_is_live
    AND pc.tenant_id = v_actual_tenant_id;  -- TENANT FILTER
  ELSE
    v_parent_contacts := '[]'::jsonb;
  END IF;

  -- Combine all data
  SELECT 
    v_contact || 
    jsonb_build_object(
      'contact_channels', v_channels,
      'contact_addresses', v_addresses,
      'addresses', v_addresses,  -- Duplicate for backward compatibility
      'contact_persons', v_contact_persons,
      'parent_contacts', v_parent_contacts
    ) INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result,
    'message', 'Contact retrieved successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'GET_CONTACT_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean, "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_tenant_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  tenant_id UUID;
BEGIN
  -- Try to get from HTTP header first
  BEGIN
    tenant_id := (NULLIF(current_setting('request.headers', true)::json->>'x-tenant-id', ''))::UUID;
    IF tenant_id IS NOT NULL THEN
      RETURN tenant_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Do nothing, try the next method
  END;

  -- Try to get from session variable (set by application)
  BEGIN
    tenant_id := (current_setting('app.current_tenant_id', true))::UUID;
    IF tenant_id IS NOT NULL THEN
      RETURN tenant_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Do nothing, try the next method
  END;

  -- If all else fails, check if user belongs to only one tenant
  SELECT ut.tenant_id INTO tenant_id
  FROM t_user_tenants ut
  WHERE ut.user_id = auth.uid() AND ut.status = 'active'
  LIMIT 1;

  RETURN tenant_id;
END;
$$;


ALTER FUNCTION "public"."get_current_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_tax_rate_sequence"("p_tenant_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(sequence_no), 0) + 1
  INTO next_seq
  FROM t_tax_rates 
  WHERE tenant_id = p_tenant_id 
    AND is_active = true;
  
  RETURN next_seq;
END;
$$;


ALTER FUNCTION "public"."get_next_tax_rate_sequence"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_version_number"("p_original_item_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  -- Get the highest version number for this original item
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_max_version
  FROM t_catalog_items
  WHERE original_item_id = p_original_item_id OR id = p_original_item_id;
  
  RETURN v_max_version;
END;
$$;


ALTER FUNCTION "public"."get_next_version_number"("p_original_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_product_master_data"("p_category_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_result jsonb;
    v_category_result jsonb;
  BEGIN
    -- 1. VALIDATE INPUT PARAMETERS
    IF p_category_name IS NOT NULL AND trim(p_category_name) = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'category_name cannot be empty',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 2. GET SINGLE CATEGORY OR ALL CATEGORIES
    IF p_category_name IS NOT NULL THEN
      -- GET SPECIFIC MASTER DATA CATEGORY WITH EXPLICIT FIELDS
      SELECT jsonb_build_object(
        'category', jsonb_build_object(
          'id', cm.id,
          'category_name', cm.category_name,
          'display_name', cm.display_name,
          'description', cm.description,
          'icon_name', cm.icon_name,
          'order_sequence', cm.order_sequence,
          'is_active', cm.is_active,
          'created_at', cm.created_at,
          'updated_at', cm.updated_at
        ),
        'details', COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', cd.id,
              'sub_cat_name', cd.sub_cat_name,
              'display_name', cd.display_name,
              'hexcolor', cd.hexcolor,
              'icon_name', cd.icon_name,
              'sequence_no', cd.sequence_no,
              'description', cd.description,
              'tool_tip', cd.tool_tip,
              'tags', cd.tags,
              'form_settings', cd.form_settings,
              'is_active', cd.is_active,
              'is_deletable', cd.is_deletable,
              'created_at', cd.created_at,
              'updated_at', cd.updated_at
            ) ORDER BY cd.sequence_no, cd.display_name
          ) FILTER (WHERE cd.id IS NOT NULL),
          '[]'::jsonb
        ),
        'total_details', COALESCE(
          (SELECT COUNT(*) FROM m_category_details WHERE category_id = cm.id AND is_active = true),
          0
        )
      ) INTO v_category_result
      FROM m_category_master cm
      LEFT JOIN m_category_details cd ON cm.id = cd.category_id AND cd.is_active = true
      WHERE cm.category_name = p_category_name
        AND cm.is_active = true
      GROUP BY cm.id, cm.category_name, cm.display_name, cm.description,
               cm.icon_name, cm.order_sequence, cm.is_active, cm.created_at, cm.updated_at;

      -- CHECK IF CATEGORY EXISTS
      IF v_category_result IS NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Master data category not found: ' || p_category_name,
          'code', 'CATEGORY_NOT_FOUND',
          'available_categories', (
            SELECT jsonb_agg(category_name ORDER BY order_sequence, category_name)
            FROM m_category_master
            WHERE is_active = true
          )
        );
      END IF;

      v_result := v_category_result;

    ELSE
      -- GET ALL MASTER DATA CATEGORIES WITH SUMMARY INFO
      SELECT jsonb_build_object(
        'categories', jsonb_agg(
          jsonb_build_object(
            'id', cm.id,
            'category_name', cm.category_name,
            'display_name', cm.display_name,
            'description', cm.description,
            'icon_name', cm.icon_name,
            'order_sequence', cm.order_sequence,
            'is_active', cm.is_active,
            'total_details', COALESCE(
              (SELECT COUNT(*) FROM m_category_details cd WHERE cd.category_id = cm.id AND cd.is_active = true),
              0
            ),
            'sample_details', COALESCE(
              (SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', cd.id,
                    'sub_cat_name', cd.sub_cat_name,
                    'display_name', cd.display_name,
                    'hexcolor', cd.hexcolor,
                    'icon_name', cd.icon_name
                  ) ORDER BY cd.sequence_no, cd.display_name
                )
                FROM (
                  SELECT * FROM m_category_details cd
                  WHERE cd.category_id = cm.id AND cd.is_active = true
                  ORDER BY cd.sequence_no, cd.display_name
                  LIMIT 5
                ) cd
              ),
              '[]'::jsonb
            ),
            'created_at', cm.created_at,
            'updated_at', cm.updated_at
          ) ORDER BY cm.order_sequence, cm.display_name
        ),
        'total_categories', COUNT(*),
        'active_categories', COUNT(*) FILTER (WHERE cm.is_active = true)
      ) INTO v_result
      FROM m_category_master cm
      WHERE cm.is_active = true
      GROUP BY (); -- Aggregate all rows

    END IF;

    -- 3. SUCCESS RESPONSE
    RETURN jsonb_build_object(
      'success', true,
      'data', v_result,
      'message', CASE
        WHEN p_category_name IS NOT NULL
        THEN 'Master data retrieved successfully for category: ' || p_category_name
        ELSE 'All master data categories retrieved successfully'
      END,
      'query_info', jsonb_build_object(
        'category_requested', p_category_name,
        'is_single_category', p_category_name IS NOT NULL,
        'retrieved_at', NOW()
      )
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR',
        'query_info', jsonb_build_object(
          'category_requested', p_category_name,
          'error_occurred_at', NOW()
        )
      );
  END;
  $$;


ALTER FUNCTION "public"."get_product_master_data"("p_category_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_result jsonb;
    v_resources jsonb;
  BEGIN
    -- 1. VALIDATE INPUT PARAMETERS
    IF p_service_id IS NULL OR p_tenant_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'service_id and tenant_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 2. GET SERVICE WITH EXPLICIT FIELD SELECTION AND MASTER DATA LOOKUPS
    SELECT jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'short_description', s.short_description,
      'description_content', s.description_content,
      'description_format', s.description_format,
      'type', s.type,
      'industry_id', s.industry_id,
      'category_id', s.category_id,
      'status', s.status,
      'is_live', s.is_live,
      'parent_id', s.parent_id,
      'is_variant', s.is_variant,
      'price_attributes', s.price_attributes,
      'tax_config', s.tax_config,
      'service_attributes', s.service_attributes,
      'resource_requirements', s.resource_requirements,
      'specifications', s.specifications,
      'terms_content', s.terms_content,
      'terms_format', s.terms_format,
      'variant_attributes', s.variant_attributes,
      'metadata', s.metadata,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'created_by', s.created_by,
      'updated_by', s.updated_by,
      -- Master data display values
      'industry_display', i.name,
      'industry_icon', i.icon,
      'category_display', c.name,
      'category_icon', c.icon,
      'pricing_type_display', pt.display_name,
      'pricing_type_color', pt.hexcolor,
      'service_status_display', ss.display_name,
      'service_status_color', ss.hexcolor,
      'tax_applicability_display', ta.display_name
    ) INTO v_result
    FROM t_catalog_items s
    LEFT JOIN m_catalog_industries i ON s.industry_id = i.id
    LEFT JOIN m_catalog_categories c ON s.category_id = c.id
    LEFT JOIN m_category_details pt ON (s.price_attributes->>'pricing_type_id')::uuid = pt.id
    LEFT JOIN m_category_details ss ON (s.service_attributes->>'service_status_id')::uuid = ss.id
    LEFT JOIN m_category_details ta ON (s.tax_config->>'tax_applicability_id')::uuid = ta.id
    WHERE s.id = p_service_id
      AND s.tenant_id = p_tenant_id
      AND s.is_live = p_is_live;

    -- 3. CHECK IF SERVICE EXISTS
    IF v_result IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service not found',
        'code', 'RECORD_NOT_FOUND'
      );
    END IF;

    -- 4. GET ASSOCIATED RESOURCES WITH EXPLICIT FIELD SELECTION
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', sr.id,
        'resource_type_id', sr.resource_type_id,
        'resource_type_display', rt.name,
        'resource_type_icon', rt.icon,
        'allocation_type_id', sr.allocation_type_id,
        'allocation_type_display', at.display_name,
        'allocation_type_color', at.hexcolor,
        'quantity_required', sr.quantity_required,
        'duration_hours', sr.duration_hours,
        'unit_cost', sr.unit_cost,
        'currency_code', sr.currency_code,
        'is_billable', sr.is_billable,
        'required_skills', sr.required_skills,
        'required_attributes', sr.required_attributes,
        'sequence_order', sr.sequence_order,
        'created_at', sr.created_at
      ) ORDER BY sr.sequence_order, sr.created_at
    ), '[]'::jsonb) INTO v_resources
    FROM t_catalog_service_resources sr
    LEFT JOIN m_catalog_resource_types rt ON sr.resource_type_id = rt.id
    LEFT JOIN m_category_details at ON sr.allocation_type_id = at.id
    WHERE sr.service_id = p_service_id
      AND sr.tenant_id = p_tenant_id
      AND sr.is_active = true;

    -- 5. ADD RESOURCES TO RESULT
    v_result := v_result || jsonb_build_object('resources', v_resources);

    -- 6. ADD CALCULATED FIELDS
    v_result := v_result || jsonb_build_object(
      'resource_count', jsonb_array_length(v_resources),
      'estimated_total_cost', (
        SELECT COALESCE(SUM((sr.unit_cost * sr.quantity_required)), 0)
        FROM t_catalog_service_resources sr
        WHERE sr.service_id = p_service_id
          AND sr.tenant_id = p_tenant_id
          AND sr.is_active = true
          AND sr.is_billable = true
      ),
      'has_resources', jsonb_array_length(v_resources) > 0
    );

    -- 7. SUCCESS RESPONSE
    RETURN jsonb_build_object(
      'success', true,
      'data', v_result,
      'message', 'Service retrieved successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."get_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean, "p_currency_code" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_service_pricing jsonb;
    v_filtered_pricing jsonb;
  BEGIN
    -- Get service pricing data
    SELECT jsonb_build_object(
      'service_id', s.id,
      'service_name', s.name,
      'pricing_data', s.price_attributes,
      'tax_config', s.tax_config,
      'currency_filter', p_currency_code,
      'retrieved_at', NOW()
    ) INTO v_service_pricing
    FROM t_catalog_items s
    WHERE s.id = p_service_id
      AND s.tenant_id = p_tenant_id
      AND s.is_live = p_is_live;

    IF v_service_pricing IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service not found',
        'code', 'RECORD_NOT_FOUND'
      );
    END IF;

    -- Filter by currency if specified
    IF p_currency_code IS NOT NULL THEN
      v_filtered_pricing := v_service_pricing;

      IF v_service_pricing->'pricing_data' ? 'currency_pricing' THEN
        SELECT jsonb_agg(pricing_entry) INTO v_filtered_pricing
        FROM jsonb_array_elements(v_service_pricing->'pricing_data'->'currency_pricing') AS pricing_entry
        WHERE pricing_entry->>'currency_code' = p_currency_code;

        v_service_pricing := jsonb_set(
          v_service_pricing,
          '{pricing_data,currency_pricing}',
          COALESCE(v_filtered_pricing, '[]'::jsonb)
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'data', v_service_pricing,
      'message', 'Service pricing retrieved successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."get_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean, "p_currency_code" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_service_exists boolean;
    v_resources jsonb;
    v_summary jsonb;
  BEGIN
    -- 1. VALIDATE INPUT PARAMETERS
    IF p_service_id IS NULL OR p_tenant_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'service_id and tenant_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 2. CHECK IF SERVICE EXISTS AND IS ACCESSIBLE
    SELECT EXISTS(
      SELECT 1 FROM t_catalog_items
      WHERE id = p_service_id
        AND tenant_id = p_tenant_id
        AND is_live = p_is_live
    ) INTO v_service_exists;

    IF NOT v_service_exists THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service not found or access denied',
        'code', 'RECORD_NOT_FOUND'
      );
    END IF;

    -- 3. GET SERVICE RESOURCES WITH EXPLICIT FIELD SELECTION AND MASTER DATA LOOKUPS
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', sr.id,
        'service_id', sr.service_id,
        'resource_type_id', sr.resource_type_id,
        'resource_type_display', rt.name,
        'resource_type_description', rt.description,
        'resource_type_icon', rt.icon,
        'resource_type_pricing_model', rt.pricing_model,
        'allocation_type_id', sr.allocation_type_id,
        'allocation_type_display', at.display_name,
        'allocation_type_description', at.description,
        'allocation_type_color', at.hexcolor,
        'allocation_type_icon', at.icon_name,
        'quantity_required', sr.quantity_required,
        'duration_hours', sr.duration_hours,
        'unit_cost', sr.unit_cost,
        'currency_code', sr.currency_code,
        'is_billable', sr.is_billable,
        'required_skills', sr.required_skills,
        'required_attributes', sr.required_attributes,
        'sequence_order', sr.sequence_order,
        'is_active', sr.is_active,
        'created_at', sr.created_at,
        'updated_at', sr.updated_at,
        -- Computed fields
        'total_cost', CASE
          WHEN sr.is_billable = true
          THEN (sr.unit_cost * sr.quantity_required)
          ELSE 0
        END,
        'estimated_duration_total', CASE
          WHEN sr.duration_hours IS NOT NULL
          THEN (sr.duration_hours * sr.quantity_required)
          ELSE NULL
        END,
        'skills_count', COALESCE(jsonb_array_length(sr.required_skills), 0),
        'attributes_count', COALESCE(jsonb_array_length(jsonb_object_keys(sr.required_attributes)), 0),
        -- Available resources of this type
        'available_resources', COALESCE(
          (SELECT jsonb_agg(
             jsonb_build_object(
               'id', r.id,
               'name', r.name,
               'is_available', r.is_available,
               'hourly_cost', r.hourly_cost,
               'daily_cost', r.daily_cost,
               'capacity_per_day', r.capacity_per_day,
               'skills', r.skills,
               'is_mobile', r.is_mobile
             )
           )
           FROM t_catalog_resources r
           WHERE r.resource_type_id = sr.resource_type_id
             AND r.tenant_id = sr.tenant_id
             AND r.is_live = p_is_live
             AND r.status = 'active'
             AND r.is_available = true
           LIMIT 10
          ),
          '[]'::jsonb
        )
      ) ORDER BY sr.sequence_order, sr.created_at
    ), '[]'::jsonb) INTO v_resources
    FROM t_catalog_service_resources sr
    LEFT JOIN m_catalog_resource_types rt ON sr.resource_type_id = rt.id
    LEFT JOIN m_category_details at ON sr.allocation_type_id = at.id
    WHERE sr.service_id = p_service_id
      AND sr.tenant_id = p_tenant_id
      AND sr.is_active = true;

    -- 4. CALCULATE SUMMARY STATISTICS
    SELECT jsonb_build_object(
      'total_resources', jsonb_array_length(v_resources),
      'billable_resources', (
        SELECT COUNT(*)::integer
        FROM jsonb_array_elements(v_resources) AS elem
        WHERE (elem->>'is_billable')::boolean = true
      ),
      'non_billable_resources', (
        SELECT COUNT(*)::integer
        FROM jsonb_array_elements(v_resources) AS elem
        WHERE (elem->>'is_billable')::boolean = false
      ),
      'total_estimated_cost', (
        SELECT COALESCE(SUM((elem->>'total_cost')::numeric), 0)
        FROM jsonb_array_elements(v_resources) AS elem
      ),
      'total_estimated_hours', (
        SELECT COALESCE(SUM((elem->>'estimated_duration_total')::numeric), 0)
        FROM jsonb_array_elements(v_resources) AS elem
        WHERE elem->>'estimated_duration_total' IS NOT NULL
      ),
      'resource_types', (
        SELECT COALESCE(jsonb_agg(DISTINCT elem->>'resource_type_id'), '[]'::jsonb)
        FROM jsonb_array_elements(v_resources) AS elem
      ),
      'allocation_types', (
        SELECT COALESCE(jsonb_agg(DISTINCT
          jsonb_build_object(
            'id', elem->>'allocation_type_id',
            'display', elem->>'allocation_type_display',
            'color', elem->>'allocation_type_color'
          )
        ) FILTER (WHERE elem->>'allocation_type_id' IS NOT NULL), '[]'::jsonb)
        FROM jsonb_array_elements(v_resources) AS elem
      ),
      'currencies_used', (
        SELECT COALESCE(jsonb_agg(DISTINCT elem->>'currency_code'), '[]'::jsonb)
        FROM jsonb_array_elements(v_resources) AS elem
        WHERE elem->>'currency_code' IS NOT NULL
      ),
      'skills_required', (
        SELECT COALESCE(jsonb_agg(DISTINCT skill_elem), '[]'::jsonb)
        FROM jsonb_array_elements(v_resources) AS resource_elem,
             jsonb_array_elements_text(resource_elem->'required_skills') AS skill_elem
      ),
      'has_mobile_requirements', (
        SELECT EXISTS(
          SELECT 1 FROM jsonb_array_elements(v_resources) AS elem,
                       jsonb_array_elements(elem->'available_resources') AS avail_elem
          WHERE (avail_elem->>'is_mobile')::boolean = true
        )
      ),
      'complexity_score', CASE
        WHEN jsonb_array_length(v_resources) = 0 THEN 0
        WHEN jsonb_array_length(v_resources) <= 2 THEN 1
        WHEN jsonb_array_length(v_resources) <= 5 THEN 2
        ELSE 3
      END
    ) INTO v_summary;

    -- 5. SUCCESS RESPONSE
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'service_id', p_service_id,
        'resources', v_resources,
        'summary', v_summary,
        'retrieved_at', NOW()
      ),
      'message', 'Service resources retrieved successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."get_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_tenant_ids"() RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN ARRAY(
    SELECT tenant_id 
    FROM t_user_tenants 
    WHERE user_id = auth.uid() 
    AND status = 'active'
  );
END;
$$;


ALTER FUNCTION "public"."get_user_tenant_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_catalog_versioning"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- When creating a new version, set is_latest to false for previous versions
    IF NEW.parent_id IS NOT NULL AND NEW.is_latest = true THEN
        UPDATE t_tenant_catalog 
        SET is_latest = false 
        WHERE tenant_id = NEW.tenant_id 
        AND name = NEW.name 
        AND catalog_id != NEW.catalog_id 
        AND is_latest = true;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_catalog_versioning"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_tenant_access"("check_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if user has access to this tenant
  RETURN EXISTS (
    SELECT 1 FROM t_user_tenants
    WHERE user_id = auth.uid()
    AND tenant_id = check_tenant_id
    AND status = 'active'
  );
END;
$$;


ALTER FUNCTION "public"."has_tenant_access"("check_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_tenant_role"("check_tenant_id" "uuid", "role_names" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM t_user_tenants ut
    JOIN t_user_tenant_roles utr ON ut.id = utr.user_tenant_id
    JOIN t_category_details cd ON utr.role_id = cd.id
    WHERE ut.user_id = auth.uid()
    AND ut.tenant_id = check_tenant_id
    AND ut.status = 'active'
    AND cd.sub_cat_name = ANY(role_names)
  );
END;
$$;


ALTER FUNCTION "public"."has_tenant_role"("check_tenant_id" "uuid", "role_names" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_tenant_onboarding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Create main onboarding record
    INSERT INTO t_tenant_onboarding (
        tenant_id,
        onboarding_type,
        total_steps,
        step_data
    ) VALUES (
        NEW.id,
        'business',
        6, -- Adjusted based on your actual steps
        '{}'::jsonb
    );
    
    -- Create individual step records
    INSERT INTO t_onboarding_step_status (tenant_id, step_id, step_sequence, status)
    VALUES 
        (NEW.id, 'user-profile', 1, 'pending'),
        (NEW.id, 'business-profile', 2, 'pending'),
        (NEW.id, 'data-setup', 3, 'pending'),
        (NEW.id, 'storage', 4, 'pending'),
        (NEW.id, 'team', 5, 'pending'),
        (NEW.id, 'tour', 6, 'pending');
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."initialize_tenant_onboarding"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_audit_logs_batch"("logs" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_log JSONB;
  v_inserted_count INTEGER := 0;
  v_errors JSONB := '[]'::JSONB;
BEGIN
  -- Loop through each log entry
  FOR v_log IN SELECT * FROM jsonb_array_elements(logs)
  LOOP
    BEGIN
      -- Insert the audit log
      INSERT INTO t_audit_logs (
        tenant_id,
        user_id,
        action,
        resource,
        resource_id,
        metadata,
        ip_address,
        user_agent,
        success,
        error_message,
        severity,
        session_id,
        correlation_id,
        created_at
      ) VALUES (
        (v_log->>'tenant_id')::UUID,
        (v_log->>'user_id')::UUID,
        v_log->>'action',
        v_log->>'resource',
        v_log->>'resource_id',
        v_log->'metadata',
        v_log->>'ip_address',
        v_log->>'user_agent',
        (v_log->>'success')::BOOLEAN,
        v_log->>'error_message',
        v_log->>'severity',
        v_log->>'session_id',
        v_log->>'correlation_id',
        (v_log->>'created_at')::TIMESTAMPTZ
      );
      
      v_inserted_count := v_inserted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Capture error but continue processing
      v_errors := v_errors || jsonb_build_object(
        'log', v_log,
        'error', SQLERRM
      );
    END;
  END LOOP;
  
  -- Return result
  RETURN jsonb_build_object(
    'inserted', v_inserted_count,
    'errors', v_errors,
    'total', jsonb_array_length(logs)
  );
END;
$$;


ALTER FUNCTION "public"."insert_audit_logs_batch"("logs" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."insert_audit_logs_batch"("logs" "jsonb") IS 'Batch insert audit logs with SECURITY DEFINER to bypass RLS';



CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM t_user_profiles
    WHERE user_id = auth.uid()
    AND is_admin = true
  );
END;
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tenant_admin"("check_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM t_user_tenants
    WHERE user_id = auth.uid()
    AND tenant_id = check_tenant_id
    AND is_admin = true
    AND status = 'active'
  );
END;
$$;


ALTER FUNCTION "public"."is_tenant_admin"("check_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promote_catalog_test_to_live"("p_tenant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- This is a critical operation - create a backup first
  -- Then replace live data with test data
  
  -- Begin transaction
  BEGIN
    -- Delete live data
    DELETE FROM t_catalog_items WHERE tenant_id = p_tenant_id AND is_live = TRUE;
    DELETE FROM t_catalog_categories WHERE tenant_id = p_tenant_id AND is_live = TRUE;  
    DELETE FROM t_catalog_industries WHERE tenant_id = p_tenant_id AND is_live = TRUE;
    
    -- Promote test data to live
    UPDATE t_catalog_industries SET is_live = TRUE WHERE tenant_id = p_tenant_id AND is_live = FALSE;
    UPDATE t_catalog_categories SET is_live = TRUE WHERE tenant_id = p_tenant_id AND is_live = FALSE;
    UPDATE t_catalog_items SET is_live = TRUE WHERE tenant_id = p_tenant_id AND is_live = FALSE;
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Test data successfully promoted to live environment'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'message', 'Failed to promote test data to live environment'
    );
  END;
END;
$$;


ALTER FUNCTION "public"."promote_catalog_test_to_live"("p_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."promote_catalog_test_to_live"("p_tenant_id" "uuid") IS 'Promotes test catalog data to live environment. USE WITH CAUTION - this replaces live data.';



CREATE OR REPLACE FUNCTION "public"."query_service_catalog_items"("p_tenant_id" "uuid", "p_is_live" boolean, "p_filters" "jsonb" DEFAULT '{}'::"jsonb", "p_page" integer DEFAULT 1, "p_limit" integer DEFAULT 20) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
  DECLARE
    v_offset integer;
    v_total_count integer;
    v_services jsonb;
    v_where_conditions text[] := ARRAY['s.tenant_id = $1', 's.is_live = $2'];
    v_join_conditions text := '';
    v_order_by text := 'ORDER BY s.updated_at DESC';
    v_query text;
    v_count_query text;
    v_param_count integer := 2;
    v_search_term text;
  BEGIN
    -- 1. VALIDATE INPUT PARAMETERS
    IF p_tenant_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'tenant_id is required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 2. VALIDATE AND SET PAGINATION
    v_offset := GREATEST((p_page - 1) * p_limit, 0);

    -- Limit the page size to prevent abuse
    IF p_limit > 100 THEN
      p_limit := 100;
    ELSIF p_limit < 1 THEN
      p_limit := 20;
    END IF;

    -- 3. BUILD DYNAMIC WHERE CONDITIONS SAFELY
    -- Status filter
    IF p_filters->>'status' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['s.status = ''' || replace(p_filters->>'status', '''', '''''') || ''''];
    END IF;

    -- Type filter
    IF p_filters->>'type' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['s.type = ''' || replace(p_filters->>'type', '''', '''''') || ''''];
    END IF;

    -- Industry filter
    IF p_filters->>'industry_id' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['s.industry_id = ''' || replace(p_filters->>'industry_id', '''', '''''') ||
  ''''];
    END IF;

    -- Category filter
    IF p_filters->>'category_id' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['s.category_id = ''' || replace(p_filters->>'category_id', '''', '''''') ||
  ''''];
    END IF;

    -- Pricing type filter
    IF p_filters->>'pricing_type_id' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['(s.price_attributes->>''pricing_type_id'')::uuid = ''' ||
  replace(p_filters->>'pricing_type_id', '''', '''''') || '''::uuid'];
    END IF;

    -- Service status filter
    IF p_filters->>'service_status_id' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['(s.service_attributes->>''service_status_id'')::uuid = ''' ||
  replace(p_filters->>'service_status_id', '''', '''''') || '''::uuid'];
    END IF;

    -- Has resources filter
    IF p_filters->>'has_resources' IS NOT NULL THEN
      IF p_filters->>'has_resources' = 'true' THEN
        v_where_conditions := v_where_conditions || ARRAY['EXISTS(SELECT 1 FROM t_catalog_service_resources sr WHERE sr.service_id = s.id     
   AND sr.is_active = true)'];
      ELSIF p_filters->>'has_resources' = 'false' THEN
        v_where_conditions := v_where_conditions || ARRAY['NOT EXISTS(SELECT 1 FROM t_catalog_service_resources sr WHERE sr.service_id =      
  s.id AND sr.is_active = true)'];
      END IF;
    END IF;

    -- Date range filters
    IF p_filters->>'created_after' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['s.created_at >= ''' || p_filters->>'created_after' || '''::timestamp with time       
  zone'];
    END IF;

    IF p_filters->>'created_before' IS NOT NULL THEN
      v_where_conditions := v_where_conditions || ARRAY['s.created_at <= ''' || p_filters->>'created_before' || '''::timestamp with time      
  zone'];
    END IF;

    -- Search functionality (case-insensitive)
    IF p_filters->>'search' IS NOT NULL AND trim(p_filters->>'search') != '' THEN
      v_search_term := '%' || lower(trim(p_filters->>'search')) || '%';
      v_where_conditions := v_where_conditions || ARRAY['(
        lower(s.name) LIKE ''' || replace(v_search_term, '''', '''''') || ''' OR
        lower(s.short_description) LIKE ''' || replace(v_search_term, '''', '''''') || ''' OR
        lower(s.description_content) LIKE ''' || replace(v_search_term, '''', '''''') || '''
      )'];
    END IF;

    -- Archived filter (default to exclude archived unless specifically requested)
    IF p_filters->>'include_archived' IS NULL OR p_filters->>'include_archived' != 'true' THEN
      v_where_conditions := v_where_conditions || ARRAY['s.status != ''archived'''];
    END IF;

    -- 4. BUILD SORTING
    IF p_filters->>'sort_by' IS NOT NULL THEN
      CASE p_filters->>'sort_by'
        WHEN 'name' THEN
          v_order_by := 'ORDER BY s.name ' || COALESCE(p_filters->>'sort_order', 'ASC');
        WHEN 'created_at' THEN
          v_order_by := 'ORDER BY s.created_at ' || COALESCE(p_filters->>'sort_order', 'DESC');
        WHEN 'updated_at' THEN
          v_order_by := 'ORDER BY s.updated_at ' || COALESCE(p_filters->>'sort_order', 'DESC');
        WHEN 'status' THEN
          v_order_by := 'ORDER BY s.status ' || COALESCE(p_filters->>'sort_order', 'ASC');
        ELSE
          v_order_by := 'ORDER BY s.updated_at DESC';
      END CASE;
    END IF;

    -- 5. GET TOTAL COUNT (SEPARATE TRANSACTION FOR PERFORMANCE)
    v_count_query := 'SELECT COUNT(*) FROM t_catalog_items s WHERE ' || array_to_string(v_where_conditions, ' AND ');

    EXECUTE v_count_query USING p_tenant_id, p_is_live INTO v_total_count;

    -- 6. GET SERVICES WITH EXPLICIT FIELD SELECTION AND MASTER DATA LOOKUPS
    v_query := '
      SELECT jsonb_agg(
        jsonb_build_object(
          ''id'', s.id,
          ''name'', s.name,
          ''short_description'', s.short_description,
          ''type'', s.type,
          ''status'', s.status,
          ''industry_id'', s.industry_id,
          ''category_id'', s.category_id,
          ''price_attributes'', s.price_attributes,
          ''service_attributes'', s.service_attributes,
          ''is_variant'', s.is_variant,
          ''created_at'', s.created_at,
          ''updated_at'', s.updated_at,
          ''created_by'', s.created_by,
          ''updated_by'', s.updated_by,
          -- Include master data lookups
          ''industry_display'', i.name,
          ''industry_icon'', i.icon,
          ''category_display'', c.name,
          ''category_icon'', c.icon,
          ''pricing_type_display'', pt.display_name,
          ''pricing_type_color'', pt.hexcolor,
          ''service_status_display'', ss.display_name,
          ''service_status_color'', ss.hexcolor,
          -- Include computed fields
          ''resource_count'', COALESCE(
            (SELECT COUNT(*) FROM t_catalog_service_resources sr WHERE sr.service_id = s.id AND sr.is_active = true),
            0
          ),
          ''estimated_total_cost'', COALESCE(
            (SELECT SUM(sr.unit_cost * sr.quantity_required) FROM t_catalog_service_resources sr
             WHERE sr.service_id = s.id AND sr.is_active = true AND sr.is_billable = true),
            0
          )
        )
      ) FROM (
        SELECT s.*
        FROM t_catalog_items s
        LEFT JOIN m_catalog_industries i ON s.industry_id = i.id
        LEFT JOIN m_catalog_categories c ON s.category_id = c.id
        LEFT JOIN m_category_details pt ON (s.price_attributes->>''pricing_type_id'')::uuid = pt.id
        LEFT JOIN m_category_details ss ON (s.service_attributes->>''service_status_id'')::uuid = ss.id
        WHERE ' || array_to_string(v_where_conditions, ' AND ') || '
        ' || v_order_by || '
        LIMIT ' || p_limit || ' OFFSET ' || v_offset || '
      ) s
      LEFT JOIN m_catalog_industries i ON s.industry_id = i.id
      LEFT JOIN m_catalog_categories c ON s.category_id = c.id
      LEFT JOIN m_category_details pt ON (s.price_attributes->>''pricing_type_id'')::uuid = pt.id
      LEFT JOIN m_category_details ss ON (s.service_attributes->>''service_status_id'')::uuid = ss.id
    ';

    EXECUTE v_query USING p_tenant_id, p_is_live INTO v_services;

    -- 7. SUCCESS RESPONSE WITH PAGINATION INFO
    RETURN jsonb_build_object(
      'success', true,
      'data', COALESCE(v_services, '[]'::jsonb),
      'pagination', jsonb_build_object(
        'page', p_page,
        'limit', p_limit,
        'total', v_total_count,
        'pages', CEILING(v_total_count::decimal / p_limit),
        'has_next', (p_page * p_limit) < v_total_count,
        'has_prev', p_page > 1
      ),
      'filters_applied', p_filters,
      'message', 'Services retrieved successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $_$;


ALTER FUNCTION "public"."query_service_catalog_items"("p_tenant_id" "uuid", "p_is_live" boolean, "p_filters" "jsonb", "p_page" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_contact_classification"("contact_id" "uuid", "classification" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE t_contacts 
    SET classifications = classifications - classification
    WHERE id = contact_id;
END;
$$;


ALTER FUNCTION "public"."remove_contact_classification"("contact_id" "uuid", "classification" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_contact_tag"("contact_id" "uuid", "tag_value" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE t_contacts 
    SET tags = (
        SELECT jsonb_agg(tag)
        FROM jsonb_array_elements(tags) as tag
        WHERE tag->>'value' != tag_value
    )
    WHERE id = contact_id;
END;
$$;


ALTER FUNCTION "public"."remove_contact_tag"("contact_id" "uuid", "tag_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_tax_rate_sequences"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  rate_record RECORD;
  new_sequence INTEGER := 1;
BEGIN
  -- Reorder all active rates by current sequence
  FOR rate_record IN 
    SELECT id FROM t_tax_rates 
    WHERE tenant_id = p_tenant_id 
      AND is_active = true 
    ORDER BY sequence_no ASC, name ASC
  LOOP
    UPDATE t_tax_rates 
    SET sequence_no = new_sequence, updated_at = NOW()
    WHERE id = rate_record.id;
    
    new_sequence := new_sequence + 1;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."reorder_tax_rate_sequences"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_catalog_item"("p_item_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Mark item as inactive (soft delete)
  UPDATE t_catalog_items 
  SET 
    is_active = FALSE,
    status = 'inactive',
    updated_at = NOW(),
    updated_by = auth.uid()
  WHERE id = p_item_id AND is_current_version = TRUE;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."soft_delete_catalog_item"("p_item_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."soft_delete_catalog_item"("p_item_id" "uuid") IS 'Soft deletes a catalog item by marking it inactive while preserving data for historical transactions.';



CREATE OR REPLACE FUNCTION "public"."update_catalog_timestamp_and_user"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  
  -- Auto-populate original_item_id for first version
  IF NEW.version_number = 1 AND NEW.original_item_id IS NULL THEN
    NEW.original_item_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_catalog_timestamp_and_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb" DEFAULT NULL::"jsonb", "p_addresses" "jsonb" DEFAULT NULL::"jsonb", "p_contact_persons" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_existing_contact record;
  v_channel record;
  v_address record;
  v_person record;
  v_person_contact_id uuid;
  v_person_channel record;
  v_result jsonb;
  v_person_id uuid;
BEGIN
  -- Check if contact exists and is not archived
  SELECT * INTO v_existing_contact
  FROM t_contacts
  WHERE id = p_contact_id 
    AND is_live = COALESCE((p_contact_data->>'is_live')::boolean, true);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Contact not found',
      'code', 'CONTACT_NOT_FOUND'
    );
  END IF;

  IF v_existing_contact.status = 'archived' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot update archived contact',
      'code', 'CONTACT_ARCHIVED'
    );
  END IF;

  -- Step 1: Update main contact
  UPDATE t_contacts 
  SET
    name = COALESCE((p_contact_data->>'name')::text, name),
    company_name = COALESCE((p_contact_data->>'company_name')::text, company_name),
    registration_number = COALESCE((p_contact_data->>'registration_number')::text, registration_number),
    salutation = COALESCE((p_contact_data->>'salutation')::text, salutation),
    designation = COALESCE((p_contact_data->>'designation')::text, designation),
    department = COALESCE((p_contact_data->>'department')::text, department),
    is_primary_contact = COALESCE((p_contact_data->>'is_primary_contact')::boolean, is_primary_contact),
    classifications = COALESCE(p_contact_data->'classifications', classifications),
    tags = COALESCE(p_contact_data->'tags', tags),
    compliance_numbers = COALESCE(p_contact_data->'compliance_numbers', compliance_numbers),
    notes = COALESCE((p_contact_data->>'notes')::text, notes),
    parent_contact_ids = COALESCE(p_contact_data->'parent_contact_ids', parent_contact_ids),
    updated_by = (p_contact_data->>'updated_by')::uuid,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_contact_id;

  -- Step 2: Update contact channels if provided (SAFE - full replacement only when explicitly provided)
  IF p_contact_channels IS NOT NULL THEN
    -- Delete existing channels only if new channels are provided
    DELETE FROM t_contact_channels WHERE contact_id = p_contact_id;
    
    -- Insert new channels
    IF jsonb_array_length(p_contact_channels) > 0 THEN
      FOR v_channel IN 
        SELECT * FROM jsonb_to_recordset(p_contact_channels) AS x(
          channel_type text,
          value text,
          country_code text,
          is_primary boolean,
          is_verified boolean,
          notes text
        )
      LOOP
        INSERT INTO t_contact_channels (
          contact_id,
          channel_type,
          value,
          country_code,
          is_primary,
          is_verified,
          notes
        )
        VALUES (
          p_contact_id,
          v_channel.channel_type,
          v_channel.value,
          v_channel.country_code,
          COALESCE(v_channel.is_primary, false),
          COALESCE(v_channel.is_verified, false),
          v_channel.notes
        );
      END LOOP;
    END IF;
  END IF;

  -- Step 3: SAFE ADDRESS HANDLING - Only add/update, never delete
  IF p_addresses IS NOT NULL THEN
    -- Process incoming addresses - CONSERVATIVE APPROACH
    FOR v_address IN 
      SELECT * FROM jsonb_to_recordset(p_addresses) AS x(
        id text,
        type text,
        address_type text,
        label text,
        address_line1 text,
        line1 text,
        address_line2 text,
        line2 text,
        city text,
        state_code text,
        state text,
        country_code text,
        country text,
        postal_code text,
        google_pin text,
        is_primary boolean,
        notes text
      )
    LOOP
      -- Check if this is a new address (temp ID, no ID, or non-existent UUID)
      IF v_address.id IS NULL 
         OR v_address.id LIKE 'temp_%' 
         OR NOT EXISTS(SELECT 1 FROM t_contact_addresses WHERE id = v_address.id::uuid) THEN
        -- Insert new address
        INSERT INTO t_contact_addresses (
          contact_id,
          type,
          label,
          address_line1,
          address_line2,
          city,
          state_code,
          country_code,
          postal_code,
          google_pin,
          is_primary,
          notes
        )
        VALUES (
          p_contact_id,
          COALESCE(v_address.type, v_address.address_type),
          v_address.label,
          COALESCE(v_address.address_line1, v_address.line1),
          COALESCE(v_address.address_line2, v_address.line2),
          v_address.city,
          COALESCE(v_address.state_code, v_address.state),
          COALESCE(v_address.country_code, v_address.country, 'IN'),
          v_address.postal_code,
          v_address.google_pin,
          COALESCE(v_address.is_primary, false),
          v_address.notes
        );
      ELSE
        -- Update existing address (only if it belongs to this contact)
        UPDATE t_contact_addresses 
        SET
          type = COALESCE(v_address.type, v_address.address_type),
          label = v_address.label,
          address_line1 = COALESCE(v_address.address_line1, v_address.line1),
          address_line2 = COALESCE(v_address.address_line2, v_address.line2),
          city = v_address.city,
          state_code = COALESCE(v_address.state_code, v_address.state),
          country_code = COALESCE(v_address.country_code, v_address.country, 'IN'),
          postal_code = v_address.postal_code,
          google_pin = v_address.google_pin,
          is_primary = COALESCE(v_address.is_primary, false),
          notes = v_address.notes,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = v_address.id::uuid 
          AND contact_id = p_contact_id; -- Security: only update addresses belonging to this contact
      END IF;
    END LOOP;
    
    -- NOTE: We deliberately DO NOT delete existing addresses
    -- If explicit deletion is needed, it should be handled separately
  END IF;

  -- Step 4: FIXED Safe contact persons handling
  IF p_contact_persons IS NOT NULL THEN
    -- Process each contact person - SIMPLIFIED APPROACH
    FOR v_person IN 
      SELECT * FROM jsonb_to_recordset(p_contact_persons) AS x(
        id text,
        name text,
        salutation text,
        designation text,
        department text,
        is_primary boolean,
        notes text,
        contact_channels jsonb
      )
    LOOP
      -- Check if this is a new person (temp ID, no ID, or non-existent UUID)
      IF v_person.id IS NULL 
         OR v_person.id LIKE 'temp_%' 
         OR NOT EXISTS(SELECT 1 FROM t_contacts WHERE id = v_person.id::uuid) THEN
        -- Insert new person
        INSERT INTO t_contacts (
          type,
          status,
          name,
          salutation,
          designation,
          department,
          is_primary_contact,
          parent_contact_ids,
          classifications,
          tags,
          compliance_numbers,
          notes,
          tenant_id,
          created_by,
          is_live
        )
        VALUES (
          'individual',
          'active',
          v_person.name,
          v_person.salutation,
          v_person.designation,
          v_person.department,
          COALESCE(v_person.is_primary, false),
          jsonb_build_array(p_contact_id),
          '["team_member"]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          v_person.notes,
          v_existing_contact.tenant_id,
          (p_contact_data->>'updated_by')::uuid,
          COALESCE((p_contact_data->>'is_live')::boolean, true)
        )
        RETURNING id INTO v_person_id;
        
        -- Debug logging
        RAISE NOTICE 'Created new contact person with ID: %', v_person_id;
      ELSE
        -- Update existing person
        v_person_id := v_person.id::uuid;
        
        UPDATE t_contacts 
        SET
          name = v_person.name,
          salutation = v_person.salutation,
          designation = v_person.designation,
          department = v_person.department,
          is_primary_contact = COALESCE(v_person.is_primary, false),
          notes = v_person.notes,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = v_person_id
          AND parent_contact_ids @> jsonb_build_array(p_contact_id); -- Security check

        -- Clear existing contact channels for update
        DELETE FROM t_contact_channels WHERE contact_id = v_person_id;
        
        -- Debug logging
        RAISE NOTICE 'Updated existing contact person with ID: %', v_person_id;
      END IF;

      -- Insert contact channels for person (both new and updated)
      IF v_person.contact_channels IS NOT NULL AND jsonb_array_length(v_person.contact_channels) > 0 THEN
        FOR v_person_channel IN 
          SELECT * FROM jsonb_to_recordset(v_person.contact_channels) AS x(
            channel_type text,
            value text,
            country_code text,
            is_primary boolean,
            is_verified boolean,
            notes text
          )
        LOOP
          INSERT INTO t_contact_channels (
            contact_id,
            channel_type,
            value,
            country_code,
            is_primary,
            is_verified,
            notes
          )
          VALUES (
            v_person_id,
            v_person_channel.channel_type,
            v_person_channel.value,
            v_person_channel.country_code,
            COALESCE(v_person_channel.is_primary, false),
            COALESCE(v_person_channel.is_verified, false),
            v_person_channel.notes
          );
        END LOOP;
        
        -- Debug logging
        RAISE NOTICE 'Added % contact channels for person ID: %', jsonb_array_length(v_person.contact_channels), v_person_id;
      END IF;
    END LOOP;
  END IF;

  -- Return the updated contact
  SELECT jsonb_build_object(
    'success', true,
    'data', to_jsonb(c.*),
    'message', 'Contact updated successfully'
  ) INTO v_result
  FROM t_contacts c
  WHERE c.id = p_contact_id;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'UPDATE_CONTACT_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb" DEFAULT NULL::"jsonb", "p_addresses" "jsonb" DEFAULT NULL::"jsonb", "p_contact_persons" "jsonb" DEFAULT NULL::"jsonb", "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_existing_contact record;
  v_channel record;
  v_address record;
  v_person record;
  v_person_contact_id uuid;
  v_person_channel record;
  v_result jsonb;
  v_person_id uuid;
  v_actual_tenant_id uuid;
BEGIN
  -- Get the tenant_id from JWT if not provided
  v_actual_tenant_id := COALESCE(
    p_tenant_id, 
    (auth.jwt() ->> 'tenant_id')::uuid,
    (SELECT tenant_id FROM t_user_profiles WHERE user_id = auth.uid() LIMIT 1)
  );

  -- Check if contact exists, is not archived, and belongs to tenant
  SELECT * INTO v_existing_contact
  FROM t_contacts
  WHERE id = p_contact_id 
    AND is_live = COALESCE((p_contact_data->>'is_live')::boolean, true)
    AND tenant_id = v_actual_tenant_id;  -- TENANT CHECK

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Contact not found or access denied',
      'code', 'CONTACT_NOT_FOUND'
    );
  END IF;

  IF v_existing_contact.status = 'archived' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot update archived contact',
      'code', 'CONTACT_ARCHIVED'
    );
  END IF;

  -- Step 1: Update main contact (with tenant check in WHERE clause)
  UPDATE t_contacts 
  SET
    name = COALESCE((p_contact_data->>'name')::text, name),
    company_name = COALESCE((p_contact_data->>'company_name')::text, company_name),
    registration_number = COALESCE((p_contact_data->>'registration_number')::text, registration_number),
    salutation = COALESCE((p_contact_data->>'salutation')::text, salutation),
    designation = COALESCE((p_contact_data->>'designation')::text, designation),
    department = COALESCE((p_contact_data->>'department')::text, department),
    is_primary_contact = COALESCE((p_contact_data->>'is_primary_contact')::boolean, is_primary_contact),
    classifications = COALESCE(p_contact_data->'classifications', classifications),
    tags = COALESCE(p_contact_data->'tags', tags),
    compliance_numbers = COALESCE(p_contact_data->'compliance_numbers', compliance_numbers),
    notes = COALESCE((p_contact_data->>'notes')::text, notes),
    parent_contact_ids = COALESCE(p_contact_data->'parent_contact_ids', parent_contact_ids),
    updated_by = (p_contact_data->>'updated_by')::uuid,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_contact_id
    AND tenant_id = v_actual_tenant_id;  -- TENANT CHECK

  -- Step 2: Update contact channels if provided
  IF p_contact_channels IS NOT NULL THEN
    -- Delete existing channels only if new channels are provided
    DELETE FROM t_contact_channels WHERE contact_id = p_contact_id;
    
    -- Insert new channels
    IF jsonb_array_length(p_contact_channels) > 0 THEN
      FOR v_channel IN 
        SELECT * FROM jsonb_to_recordset(p_contact_channels) AS x(
          channel_type text,
          value text,
          country_code text,
          is_primary boolean,
          is_verified boolean,
          notes text
        )
      LOOP
        INSERT INTO t_contact_channels (
          contact_id,
          channel_type,
          value,
          country_code,
          is_primary,
          is_verified,
          notes
        )
        VALUES (
          p_contact_id,
          v_channel.channel_type,
          v_channel.value,
          v_channel.country_code,
          COALESCE(v_channel.is_primary, false),
          COALESCE(v_channel.is_verified, false),
          v_channel.notes
        );
      END LOOP;
    END IF;
  END IF;

  -- Step 3: Handle addresses (only add/update, never delete)
  IF p_addresses IS NOT NULL THEN
    FOR v_address IN 
      SELECT * FROM jsonb_to_recordset(p_addresses) AS x(
        id text,
        type text,
        address_type text,
        label text,
        address_line1 text,
        line1 text,
        address_line2 text,
        line2 text,
        city text,
        state_code text,
        state text,
        country_code text,
        country text,
        postal_code text,
        google_pin text,
        is_primary boolean,
        notes text
      )
    LOOP
      -- Check if this is a new address
      IF v_address.id IS NULL 
         OR v_address.id LIKE 'temp_%' 
         OR NOT EXISTS(SELECT 1 FROM t_contact_addresses WHERE id = v_address.id::uuid) THEN
        -- Insert new address
        INSERT INTO t_contact_addresses (
          contact_id,
          type,
          label,
          address_line1,
          address_line2,
          city,
          state_code,
          country_code,
          postal_code,
          google_pin,
          is_primary,
          notes
        )
        VALUES (
          p_contact_id,
          COALESCE(v_address.type, v_address.address_type),
          v_address.label,
          COALESCE(v_address.address_line1, v_address.line1),
          COALESCE(v_address.address_line2, v_address.line2),
          v_address.city,
          COALESCE(v_address.state_code, v_address.state),
          COALESCE(v_address.country_code, v_address.country, 'IN'),
          v_address.postal_code,
          v_address.google_pin,
          COALESCE(v_address.is_primary, false),
          v_address.notes
        );
      ELSE
        -- Update existing address (only if it belongs to this contact)
        UPDATE t_contact_addresses 
        SET
          type = COALESCE(v_address.type, v_address.address_type),
          label = v_address.label,
          address_line1 = COALESCE(v_address.address_line1, v_address.line1),
          address_line2 = COALESCE(v_address.address_line2, v_address.line2),
          city = v_address.city,
          state_code = COALESCE(v_address.state_code, v_address.state),
          country_code = COALESCE(v_address.country_code, v_address.country, 'IN'),
          postal_code = v_address.postal_code,
          google_pin = v_address.google_pin,
          is_primary = COALESCE(v_address.is_primary, false),
          notes = v_address.notes,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = v_address.id::uuid 
          AND contact_id = p_contact_id;
      END IF;
    END LOOP;
  END IF;

  -- Step 4: Handle contact persons
  IF p_contact_persons IS NOT NULL THEN
    FOR v_person IN 
      SELECT * FROM jsonb_to_recordset(p_contact_persons) AS x(
        id text,
        name text,
        salutation text,
        designation text,
        department text,
        is_primary boolean,
        notes text,
        contact_channels jsonb
      )
    LOOP
      -- Check if this is a new person
      IF v_person.id IS NULL 
         OR v_person.id LIKE 'temp_%' 
         OR NOT EXISTS(
           SELECT 1 FROM t_contacts 
           WHERE id = v_person.id::uuid 
             AND tenant_id = v_actual_tenant_id  -- TENANT CHECK
         ) THEN
        -- Insert new person
        INSERT INTO t_contacts (
          type,
          status,
          name,
          salutation,
          designation,
          department,
          is_primary_contact,
          parent_contact_ids,
          classifications,
          tags,
          compliance_numbers,
          notes,
          tenant_id,
          created_by,
          is_live
        )
        VALUES (
          'individual',
          'active',
          v_person.name,
          v_person.salutation,
          v_person.designation,
          v_person.department,
          COALESCE(v_person.is_primary, false),
          jsonb_build_array(p_contact_id),
          '["team_member"]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          v_person.notes,
          v_existing_contact.tenant_id,
          (p_contact_data->>'updated_by')::uuid,
          COALESCE((p_contact_data->>'is_live')::boolean, true)
        )
        RETURNING id INTO v_person_id;
      ELSE
        -- Update existing person
        v_person_id := v_person.id::uuid;
        
        UPDATE t_contacts 
        SET
          name = v_person.name,
          salutation = v_person.salutation,
          designation = v_person.designation,
          department = v_person.department,
          is_primary_contact = COALESCE(v_person.is_primary, false),
          notes = v_person.notes,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = v_person_id
          AND parent_contact_ids @> jsonb_build_array(p_contact_id)
          AND tenant_id = v_actual_tenant_id;  -- TENANT CHECK

        -- Clear existing contact channels for update
        DELETE FROM t_contact_channels WHERE contact_id = v_person_id;
      END IF;

      -- Insert contact channels for person
      IF v_person.contact_channels IS NOT NULL AND jsonb_array_length(v_person.contact_channels) > 0 THEN
        FOR v_person_channel IN 
          SELECT * FROM jsonb_to_recordset(v_person.contact_channels) AS x(
            channel_type text,
            value text,
            country_code text,
            is_primary boolean,
            is_verified boolean,
            notes text
          )
        LOOP
          INSERT INTO t_contact_channels (
            contact_id,
            channel_type,
            value,
            country_code,
            is_primary,
            is_verified,
            notes
          )
          VALUES (
            v_person_id,
            v_person_channel.channel_type,
            v_person_channel.value,
            v_person_channel.country_code,
            COALESCE(v_person_channel.is_primary, false),
            COALESCE(v_person_channel.is_verified, false),
            v_person_channel.notes
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Return the updated contact
  SELECT jsonb_build_object(
    'success', true,
    'data', to_jsonb(c.*),
    'message', 'Contact updated successfully'
  ) INTO v_result
  FROM t_contacts c
  WHERE c.id = p_contact_id;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'UPDATE_CONTACT_ERROR'
    );
END;
$$;


ALTER FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_duplicate_flags"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Reset all flags
    UPDATE t_contacts SET potential_duplicate = false, duplicate_reasons = '{}';
    
    -- Find mobile duplicates
    WITH mobile_duplicates AS (
        SELECT ch1.contact_id as contact1, ch2.contact_id as contact2
        FROM t_contact_channels ch1
        JOIN t_contact_channels ch2 ON ch1.value = ch2.value 
            AND ch1.channel_type = ch2.channel_type 
            AND ch1.channel_type = 'mobile'
            AND ch1.contact_id < ch2.contact_id
        JOIN t_contacts c1 ON ch1.contact_id = c1.id
        JOIN t_contacts c2 ON ch2.contact_id = c2.id
        WHERE c1.tenant_id = c2.tenant_id
    )
    UPDATE t_contacts 
    SET potential_duplicate = true,
        duplicate_reasons = array_append(duplicate_reasons, 'mobile_match')
    WHERE id IN (
        SELECT unnest(ARRAY[contact1, contact2]) FROM mobile_duplicates
    );
    
    -- Find email duplicates
    WITH email_duplicates AS (
        SELECT ch1.contact_id as contact1, ch2.contact_id as contact2
        FROM t_contact_channels ch1
        JOIN t_contact_channels ch2 ON ch1.value = ch2.value 
            AND ch1.channel_type = ch2.channel_type 
            AND ch1.channel_type = 'email'
            AND ch1.contact_id < ch2.contact_id
        JOIN t_contacts c1 ON ch1.contact_id = c1.id
        JOIN t_contacts c2 ON ch2.contact_id = c2.id
        WHERE c1.tenant_id = c2.tenant_id
    )
    UPDATE t_contacts 
    SET potential_duplicate = true,
        duplicate_reasons = array_append(duplicate_reasons, 'email_match')
    WHERE id IN (
        SELECT unnest(ARRAY[contact1, contact2]) FROM email_duplicates
    );
END;
$$;


ALTER FUNCTION "public"."update_duplicate_flags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_master_catalog_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_master_catalog_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_modified_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_update_data" "jsonb", "p_idempotency_key" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_existing_service record;
    v_result jsonb;
    v_resource record;
    v_lock_acquired boolean := false;
    v_existing_operation_id uuid;
    v_pricing_type_exists boolean;
    v_service_status_exists boolean;
  BEGIN
    -- 1. IDEMPOTENCY CHECK
    IF p_idempotency_key IS NOT NULL THEN
      SELECT service_id INTO v_existing_operation_id
      FROM t_idempotency_keys
      WHERE idempotency_key = p_idempotency_key
        AND tenant_id = p_tenant_id
        AND operation_type = 'update_service'
        AND created_at > NOW() - INTERVAL '24 hours';

      IF FOUND THEN
        -- Return existing service
        RETURN get_service_catalog_item(v_existing_operation_id, p_tenant_id, p_is_live);
      END IF;
    END IF;

    -- 2. VALIDATE INPUT PARAMETERS
    IF p_service_id IS NULL OR p_tenant_id IS NULL OR p_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'service_id, tenant_id, and user_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 3. TRANSACTION START WITH ROW-LEVEL LOCKING
    -- Lock the service record for update to prevent race conditions
    SELECT * INTO v_existing_service
    FROM t_catalog_items
    WHERE id = p_service_id
      AND tenant_id = p_tenant_id
      AND is_live = p_is_live
    FOR UPDATE NOWAIT; -- Fail immediately if locked by another transaction

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service not found or access denied',
        'code', 'RECORD_NOT_FOUND'
      );
    END IF;

    v_lock_acquired := true;

    -- 4. VALIDATE MASTER DATA REFERENCES (if being updated)
    -- Check pricing_type_id exists in product master data
    IF p_update_data->'price_attributes'->>'pricing_type_id' IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM m_category_details cd
        JOIN m_category_master cm ON cd.category_id = cm.id
        WHERE cd.id = (p_update_data->'price_attributes'->>'pricing_type_id')::uuid
          AND cm.category_name = 'pricing_types'
          AND cd.is_active = true
      ) INTO v_pricing_type_exists;

      IF NOT v_pricing_type_exists THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Invalid pricing_type_id',
          'code', 'INVALID_REFERENCE'
        );
      END IF;
    END IF;

    -- Check service_status_id exists in product master data
    IF p_update_data->'service_attributes'->>'service_status_id' IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM m_category_details cd
        JOIN m_category_master cm ON cd.category_id = cm.id
        WHERE cd.id = (p_update_data->'service_attributes'->>'service_status_id')::uuid
          AND cm.category_name = 'service_statuses'
          AND cd.is_active = true
      ) INTO v_service_status_exists;

      IF NOT v_service_status_exists THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Invalid service_status_id',
          'code', 'INVALID_REFERENCE'
        );
      END IF;
    END IF;

    -- 5. CHECK FOR DUPLICATE NAME (if name is being updated)
    IF p_update_data->>'name' IS NOT NULL
       AND LOWER(trim(p_update_data->>'name')) != LOWER(v_existing_service.name) THEN
      IF EXISTS(
        SELECT 1 FROM t_catalog_items
        WHERE tenant_id = p_tenant_id
          AND is_live = p_is_live
          AND id != p_service_id
          AND LOWER(name) = LOWER(trim(p_update_data->>'name'))
          AND status != 'archived'
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Service with this name already exists',
          'code', 'DUPLICATE_NAME'
        );
      END IF;
    END IF;

    -- 6. CONSERVATIVE UPDATE - ONLY UPDATE PROVIDED FIELDS
    UPDATE t_catalog_items SET
      name = CASE
        WHEN p_update_data->>'name' IS NOT NULL
        THEN trim(p_update_data->>'name')
        ELSE name
      END,
      short_description = COALESCE(p_update_data->>'short_description', short_description),
      description_content = COALESCE(p_update_data->>'description_content', description_content),
      description_format = COALESCE(p_update_data->>'description_format', description_format),
      type = COALESCE(p_update_data->>'type', type),
      industry_id = COALESCE(p_update_data->>'industry_id', industry_id),
      category_id = COALESCE(p_update_data->>'category_id', category_id),
      status = COALESCE(p_update_data->>'status', status),
      -- SAFE JSONB MERGING - preserve existing data, merge new data
      price_attributes = CASE
        WHEN p_update_data->'price_attributes' IS NOT NULL
        THEN price_attributes || p_update_data->'price_attributes'
        ELSE price_attributes
      END,
      tax_config = CASE
        WHEN p_update_data->'tax_config' IS NOT NULL
        THEN tax_config || p_update_data->'tax_config'
        ELSE tax_config
      END,
      service_attributes = CASE
        WHEN p_update_data->'service_attributes' IS NOT NULL
        THEN service_attributes || p_update_data->'service_attributes'
        ELSE service_attributes
      END,
      resource_requirements = CASE
        WHEN p_update_data->'resource_requirements' IS NOT NULL
        THEN resource_requirements || p_update_data->'resource_requirements'
        ELSE resource_requirements
      END,
      specifications = CASE
        WHEN p_update_data->'specifications' IS NOT NULL
        THEN specifications || p_update_data->'specifications'
        ELSE specifications
      END,
      terms_content = COALESCE(p_update_data->>'terms_content', terms_content),
      terms_format = COALESCE(p_update_data->>'terms_format', terms_format),
      variant_attributes = CASE
        WHEN p_update_data->'variant_attributes' IS NOT NULL
        THEN variant_attributes || p_update_data->'variant_attributes'
        ELSE variant_attributes
      END,
      metadata = CASE
        WHEN p_update_data->'metadata' IS NOT NULL
        THEN metadata || p_update_data->'metadata'
        ELSE metadata
      END,
      updated_by = p_user_id,
      updated_at = NOW()
    WHERE id = p_service_id
      AND tenant_id = p_tenant_id
      AND is_live = p_is_live;

    -- 7. SAFE RESOURCE UPDATES - CONSERVATIVE APPROACH
    -- Only process resources if explicitly provided in update
    IF p_update_data->'resources' IS NOT NULL THEN
      FOR v_resource IN
        SELECT * FROM jsonb_to_recordset(p_update_data->'resources') AS x(
          id uuid,
          resource_type_id varchar(50),
          allocation_type_id uuid,
          quantity_required integer,
          duration_hours decimal(5,2),
          unit_cost decimal(15,4),
          currency_code varchar(3),
          required_skills jsonb,
          required_attributes jsonb,
          sequence_order integer,
          is_billable boolean,
          action varchar(10) -- 'add', 'update', 'remove'
        )
      LOOP
        -- SMART RECORD DETECTION AND SAFE OPERATIONS
        IF v_resource.action = 'remove' AND v_resource.id IS NOT NULL THEN
          -- Only remove explicitly marked resources with ownership check
          UPDATE t_catalog_service_resources
          SET is_active = false, updated_at = NOW()
          WHERE service_id = p_service_id
            AND id = v_resource.id
            AND tenant_id = p_tenant_id; -- Security: only remove owned records

        ELSIF v_resource.id IS NULL OR v_resource.id::text LIKE 'temp_%' OR v_resource.action = 'add' THEN
          -- This is a new resource association
          -- Validate resource_type_id exists
          IF NOT EXISTS(SELECT 1 FROM m_catalog_resource_types WHERE id = v_resource.resource_type_id AND is_active = true) THEN
            RETURN jsonb_build_object(
              'success', false,
              'error', 'Invalid resource_type_id: ' || v_resource.resource_type_id,
              'code', 'INVALID_RESOURCE_TYPE'
            );
          END IF;

          INSERT INTO t_catalog_service_resources (
            service_id, resource_type_id, tenant_id, allocation_type_id,
            quantity_required, duration_hours, unit_cost, currency_code,
            required_skills, required_attributes, sequence_order, is_billable
          ) VALUES (
            p_service_id, v_resource.resource_type_id, p_tenant_id,
            v_resource.allocation_type_id, COALESCE(v_resource.quantity_required, 1),
            v_resource.duration_hours, v_resource.unit_cost,
            COALESCE(v_resource.currency_code, 'INR'),
            COALESCE(v_resource.required_skills, '[]'::jsonb),
            COALESCE(v_resource.required_attributes, '{}'::jsonb),
            COALESCE(v_resource.sequence_order, 0),
            COALESCE(v_resource.is_billable, true)
          );

        ELSIF v_resource.action = 'update' AND v_resource.id IS NOT NULL THEN
          -- Update existing resource association with security check
          UPDATE t_catalog_service_resources SET
            allocation_type_id = COALESCE(v_resource.allocation_type_id, allocation_type_id),
            quantity_required = COALESCE(v_resource.quantity_required, quantity_required),
            duration_hours = COALESCE(v_resource.duration_hours, duration_hours),
            unit_cost = COALESCE(v_resource.unit_cost, unit_cost),
            currency_code = COALESCE(v_resource.currency_code, currency_code),
            required_skills = CASE
              WHEN v_resource.required_skills IS NOT NULL
              THEN v_resource.required_skills
              ELSE required_skills
            END,
            required_attributes = CASE
              WHEN v_resource.required_attributes IS NOT NULL
              THEN v_resource.required_attributes
              ELSE required_attributes
            END,
            sequence_order = COALESCE(v_resource.sequence_order, sequence_order),
            is_billable = COALESCE(v_resource.is_billable, is_billable),
            updated_at = NOW()
          WHERE id = v_resource.id
            AND service_id = p_service_id
            AND tenant_id = p_tenant_id; -- Security: only update owned records
        END IF;
      END LOOP;
    END IF;
    -- NOTE: We deliberately do NOT delete existing resources not mentioned

    -- 8. STORE IDEMPOTENCY KEY
    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO t_idempotency_keys (
        idempotency_key,
        tenant_id,
        operation_type,
        service_id,
        created_at
      ) VALUES (
        p_idempotency_key,
        p_tenant_id,
        'update_service',
        p_service_id,
        NOW()
      );
    END IF;

    -- 9. RETURN UPDATED RECORD
    RETURN get_service_catalog_item(p_service_id, p_tenant_id, p_is_live);

  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service is being updated by another user. Please try again.',
        'code', 'CONCURRENT_UPDATE'
      );
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING WITH ROLLBACK
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."update_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_update_data" "jsonb", "p_idempotency_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_pricing_data" "jsonb", "p_idempotency_key" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_existing_service record;
    v_existing_operation_id uuid;
    v_pricing_entry jsonb;
    v_result jsonb;
    v_updated_pricing jsonb;
    v_pricing_errors jsonb := '[]'::jsonb;
    v_success_count integer := 0;
    v_error_count integer := 0;
    v_current_pricing jsonb;
  BEGIN
    -- 1. IDEMPOTENCY CHECK
    IF p_idempotency_key IS NOT NULL THEN
      SELECT service_id INTO v_existing_operation_id
      FROM t_idempotency_keys
      WHERE idempotency_key = p_idempotency_key
        AND tenant_id = p_tenant_id
        AND operation_type = 'update_service_pricing'
        AND created_at > NOW() - INTERVAL '24 hours';

      IF FOUND THEN
        -- Return existing pricing for this service
        RETURN get_service_pricing(v_existing_operation_id, p_tenant_id, p_is_live, NULL);
      END IF;
    END IF;

    -- 2. VALIDATE INPUT PARAMETERS
    IF p_service_id IS NULL OR p_tenant_id IS NULL OR p_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'service_id, tenant_id, and user_id are required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    IF p_pricing_data IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'pricing_data is required',
        'code', 'VALIDATION_ERROR'
      );
    END IF;

    -- 3. TRANSACTION START WITH ROW-LEVEL LOCKING
    -- Lock the service record to prevent concurrent modifications
    SELECT * INTO v_existing_service
    FROM t_catalog_items
    WHERE id = p_service_id
      AND tenant_id = p_tenant_id
      AND is_live = p_is_live
    FOR UPDATE NOWAIT;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service not found or access denied',
        'code', 'RECORD_NOT_FOUND'
      );
    END IF;

    -- 4. VALIDATE SERVICE STATUS
    IF v_existing_service.status = 'archived' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot update pricing for archived service',
        'code', 'SERVICE_ARCHIVED'
      );
    END IF;

    -- 5. GET CURRENT PRICING TO PRESERVE EXISTING DATA
    v_current_pricing := COALESCE(v_existing_service.price_attributes, '{}'::jsonb);

    -- 6. PROCESS PRICING UPDATES
    IF p_pricing_data ? 'base_pricing' THEN
      -- Update base pricing information
      BEGIN
        -- Validate pricing_type_id if provided
        IF p_pricing_data->'base_pricing'->>'pricing_type_id' IS NOT NULL THEN
          IF NOT EXISTS(
            SELECT 1 FROM m_category_details cd
            JOIN m_category_master cm ON cd.category_id = cm.id
            WHERE cd.id = (p_pricing_data->'base_pricing'->>'pricing_type_id')::uuid
              AND cm.category_name = 'pricing_types'
              AND cd.is_active = true
          ) THEN
            v_error_count := v_error_count + 1;
            v_pricing_errors := v_pricing_errors || jsonb_build_object(
              'field', 'pricing_type_id',
              'error', 'Invalid pricing_type_id'
            );
          ELSE
            v_current_pricing := v_current_pricing || p_pricing_data->'base_pricing';
            v_success_count := v_success_count + 1;
          END IF;
        ELSE
          v_current_pricing := v_current_pricing || p_pricing_data->'base_pricing';
          v_success_count := v_success_count + 1;
        END IF;

      EXCEPTION
        WHEN OTHERS THEN
          v_error_count := v_error_count + 1;
          v_pricing_errors := v_pricing_errors || jsonb_build_object(
            'field', 'base_pricing',
            'error', SQLERRM
          );
      END;
    END IF;

    -- 7. PROCESS MULTI-CURRENCY PRICING
    IF p_pricing_data ? 'currency_pricing' AND jsonb_typeof(p_pricing_data->'currency_pricing') = 'array' THEN
      DECLARE
        v_currency_pricing jsonb := COALESCE(v_current_pricing->'currency_pricing', '[]'::jsonb);
        v_currency_entry jsonb;
        v_currency_code text;
        v_found_index integer;
      BEGIN
        FOR v_currency_entry IN SELECT * FROM jsonb_array_elements(p_pricing_data->'currency_pricing')
        LOOP
          v_currency_code := v_currency_entry->>'currency_code';

          -- Validate currency code
          IF v_currency_code IS NULL THEN
            v_error_count := v_error_count + 1;
            v_pricing_errors := v_pricing_errors || jsonb_build_object(
              'field', 'currency_pricing',
              'error', 'Currency code is required for each pricing entry'
            );
            CONTINUE;
          END IF;

          -- Validate price is positive
          IF (v_currency_entry->>'price')::numeric <= 0 THEN
            v_error_count := v_error_count + 1;
            v_pricing_errors := v_pricing_errors || jsonb_build_object(
              'field', 'currency_pricing',
              'currency', v_currency_code,
              'error', 'Price must be greater than zero'
            );
            CONTINUE;
          END IF;

          -- Find existing currency pricing and update or add
          v_found_index := -1;
          FOR i IN 0..jsonb_array_length(v_currency_pricing) - 1
          LOOP
            IF (v_currency_pricing->i->>'currency_code') = v_currency_code THEN
              v_found_index := i;
              EXIT;
            END IF;
          END LOOP;

          IF v_found_index >= 0 THEN
            -- Update existing currency pricing
            v_currency_pricing := jsonb_set(
              v_currency_pricing,
              ARRAY[v_found_index::text],
              v_currency_entry || jsonb_build_object('updated_at', NOW())
            );
          ELSE
            -- Add new currency pricing
            v_currency_pricing := v_currency_pricing || jsonb_build_array(
              v_currency_entry || jsonb_build_object('created_at', NOW(), 'updated_at', NOW())
            );
          END IF;

          v_success_count := v_success_count + 1;
        END LOOP;

        v_current_pricing := v_current_pricing || jsonb_build_object('currency_pricing', v_currency_pricing);

      EXCEPTION
        WHEN OTHERS THEN
          v_error_count := v_error_count + 1;
          v_pricing_errors := v_pricing_errors || jsonb_build_object(
            'field', 'currency_pricing',
            'error', SQLERRM
          );
      END;
    END IF;

    -- 8. PROCESS TIERED PRICING
    IF p_pricing_data ? 'tiered_pricing' AND jsonb_typeof(p_pricing_data->'tiered_pricing') = 'array' THEN
      BEGIN
        -- Validate tiered pricing structure
        DECLARE
          v_tier_entry jsonb;
          v_min_qty integer;
          v_max_qty integer;
        BEGIN
          FOR v_tier_entry IN SELECT * FROM jsonb_array_elements(p_pricing_data->'tiered_pricing')
          LOOP
            v_min_qty := (v_tier_entry->>'min_quantity')::integer;
            v_max_qty := (v_tier_entry->>'max_quantity')::integer;

            -- Validate tier structure
            IF v_min_qty IS NULL OR v_min_qty <= 0 THEN
              v_error_count := v_error_count + 1;
              v_pricing_errors := v_pricing_errors || jsonb_build_object(
                'field', 'tiered_pricing',
                'error', 'min_quantity must be positive integer'
              );
              CONTINUE;
            END IF;

            IF v_max_qty IS NOT NULL AND v_max_qty <= v_min_qty THEN
              v_error_count := v_error_count + 1;
              v_pricing_errors := v_pricing_errors || jsonb_build_object(
                'field', 'tiered_pricing',
                'error', 'max_quantity must be greater than min_quantity'
              );
              CONTINUE;
            END IF;

            IF (v_tier_entry->>'price')::numeric <= 0 THEN
              v_error_count := v_error_count + 1;
              v_pricing_errors := v_pricing_errors || jsonb_build_object(
                'field', 'tiered_pricing',
                'tier', v_min_qty || '-' || COALESCE(v_max_qty::text, '∞'),
                'error', 'Price must be greater than zero'
              );
              CONTINUE;
            END IF;
          END LOOP;
        END;

        -- If no errors, update tiered pricing
        IF jsonb_array_length(v_pricing_errors) = v_error_count THEN
          v_current_pricing := v_current_pricing || jsonb_build_object(
            'tiered_pricing', p_pricing_data->'tiered_pricing'
          );
          v_success_count := v_success_count + 1;
        END IF;

      EXCEPTION
        WHEN OTHERS THEN
          v_error_count := v_error_count + 1;
          v_pricing_errors := v_pricing_errors || jsonb_build_object(
            'field', 'tiered_pricing',
            'error', SQLERRM
          );
      END;
    END IF;

    -- 9. UPDATE SERVICE WITH NEW PRICING DATA
    IF v_success_count > 0 THEN
      UPDATE t_catalog_items SET
        price_attributes = v_current_pricing || jsonb_build_object(
          'pricing_updated_at', NOW(),
          'pricing_updated_by', p_user_id
        ),
        updated_by = p_user_id,
        updated_at = NOW()
      WHERE id = p_service_id
        AND tenant_id = p_tenant_id
        AND is_live = p_is_live;
    END IF;

    -- 10. STORE IDEMPOTENCY KEY
    IF p_idempotency_key IS NOT NULL AND v_success_count > 0 THEN
      INSERT INTO t_idempotency_keys (
        idempotency_key,
        tenant_id,
        operation_type,
        service_id,
        created_at
      ) VALUES (
        p_idempotency_key,
        p_tenant_id,
        'update_service_pricing',
        p_service_id,
        NOW()
      );
    END IF;

    -- 11. PREPARE RESULT
    SELECT jsonb_build_object(
      'service_id', p_service_id,
      'pricing_data', v_current_pricing,
      'update_summary', jsonb_build_object(
        'successful_updates', v_success_count,
        'failed_updates', v_error_count,
        'errors', v_pricing_errors
      ),
      'currency_count', CASE
        WHEN v_current_pricing ? 'currency_pricing'
        THEN jsonb_array_length(v_current_pricing->'currency_pricing')
        ELSE 0
      END,
      'has_tiered_pricing', v_current_pricing ? 'tiered_pricing',
      'updated_at', NOW()
    ) INTO v_result;

    -- 12. SUCCESS RESPONSE
    RETURN jsonb_build_object(
      'success', v_error_count = 0,
      'partial_success', v_success_count > 0 AND v_error_count > 0,
      'data', v_result,
      'message', CASE
        WHEN v_error_count = 0 THEN 'Service pricing updated successfully'
        WHEN v_success_count = 0 THEN 'Service pricing update failed'
        ELSE 'Service pricing partially updated with some errors'
      END
    );

  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Service is being updated by another user. Please try again.',
        'code', 'CONCURRENT_UPDATE'
      );
    WHEN OTHERS THEN
      -- PROPER ERROR HANDLING WITH ROLLBACK
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'OPERATION_ERROR'
      );
  END;
  $$;


ALTER FUNCTION "public"."update_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_pricing_data" "jsonb", "p_idempotency_key" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_environment"("p_tenant_id" "uuid", "p_is_live" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Super admins can access all environments
  IF EXISTS (SELECT 1 FROM t_user_profiles WHERE user_id = auth.uid() AND is_admin = true) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has access to this tenant and environment
  RETURN EXISTS (
    SELECT 1 FROM t_user_tenants ut 
    WHERE ut.user_id = auth.uid() 
    AND ut.tenant_id = p_tenant_id 
    AND ut.status = 'active'
    AND (
      p_is_live = TRUE OR  -- Everyone can access live data
      ut.can_access_test_data = TRUE  -- Only specific users can access test data
    )
  );
END;
$$;


ALTER FUNCTION "public"."user_can_access_environment"("p_tenant_id" "uuid", "p_is_live" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_can_access_environment"("p_tenant_id" "uuid", "p_is_live" boolean) IS 'Helper function to check if user has access to specific tenant environment (Live/Test).';



CREATE OR REPLACE FUNCTION "public"."validate_category_environment_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.industry_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM t_catalog_industries 
    WHERE id = NEW.industry_id 
    AND tenant_id = NEW.tenant_id 
    AND is_live = NEW.is_live
  ) THEN
    RAISE EXCEPTION 'Category industry must belong to same tenant and environment';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_category_environment_consistency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_item_environment_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Check if category belongs to same tenant and environment
  IF NEW.category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM t_catalog_categories cat 
      WHERE cat.id = NEW.category_id 
      AND cat.tenant_id = NEW.tenant_id 
      AND cat.is_live = NEW.is_live
    ) THEN
      RAISE EXCEPTION 'Item category must belong to same tenant and environment (tenant_id: %, is_live: %)', 
        NEW.tenant_id, NEW.is_live;
    END IF;
  END IF;
  
  -- Check if industry belongs to same tenant and environment
  IF NEW.industry_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM t_catalog_industries ind 
      WHERE ind.id = NEW.industry_id 
      AND ind.tenant_id = NEW.tenant_id 
      AND ind.is_live = NEW.is_live
    ) THEN
      RAISE EXCEPTION 'Item industry must belong to same tenant and environment (tenant_id: %, is_live: %)', 
        NEW.tenant_id, NEW.is_live;
    END IF;
  END IF;
  
  -- Check if parent item belongs to same tenant and environment
  IF NEW.parent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM t_catalog_items parent 
      WHERE parent.id = NEW.parent_id 
      AND parent.tenant_id = NEW.tenant_id 
      AND parent.is_live = NEW.is_live
    ) THEN
      RAISE EXCEPTION 'Item parent must belong to same tenant and environment (tenant_id: %, is_live: %)', 
        NEW.tenant_id, NEW.is_live;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_item_environment_consistency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_pricing_template_config"("p_rule_type" character varying, "p_condition_config" "jsonb", "p_action_config" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Validate based on rule type
  CASE p_rule_type
    WHEN 'time_based' THEN
      -- Must have time conditions
      IF NOT (p_condition_config ? 'time_ranges' OR p_condition_config ? 'days_of_week') THEN
        RETURN FALSE;
      END IF;
      
    WHEN 'quantity_based' THEN  
      -- Must have quantity thresholds
      IF NOT (p_condition_config ? 'min_quantity' OR p_condition_config ? 'quantity_tiers') THEN
        RETURN FALSE;
      END IF;
      
    WHEN 'customer_based' THEN
      -- Must have customer criteria
      IF NOT (p_condition_config ? 'customer_type' OR p_condition_config ? 'membership_level') THEN
        RETURN FALSE;
      END IF;
  END CASE;
  
  -- Validate action config has required fields
  IF NOT (p_action_config ? 'action_type' AND p_action_config ? 'value') THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."validate_pricing_template_config"("p_rule_type" character varying, "p_condition_config" "jsonb", "p_action_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_tax_rate_business_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Ensure rate is within valid range
  IF NEW.rate < 0 OR NEW.rate > 100 THEN
    RAISE EXCEPTION 'Tax rate must be between 0 and 100 percent';
  END IF;
  
  -- Ensure sequence number is positive
  IF NEW.sequence_no <= 0 THEN
    RAISE EXCEPTION 'Sequence number must be positive';
  END IF;
  
  -- Ensure name is not empty
  IF TRIM(NEW.name) = '' THEN
    RAISE EXCEPTION 'Tax rate name cannot be empty';
  END IF;
  
  -- If this is the first rate for the tenant, make it default
  IF NEW.is_active = true THEN
    DECLARE
      rate_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO rate_count
      FROM t_tax_rates 
      WHERE tenant_id = NEW.tenant_id 
        AND is_active = true 
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
      
      -- If this is the first rate, make it default
      IF rate_count = 0 THEN
        NEW.is_default = true;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_tax_rate_business_rules"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."c_category_details" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sub_cat_name" character varying(100) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "category_id" "uuid",
    "hexcolor" character varying(10),
    "icon_name" character varying(50),
    "tags" "jsonb",
    "tool_tip" "text",
    "is_active" boolean DEFAULT true,
    "sequence_no" integer,
    "description" "text",
    "is_deletable" boolean DEFAULT true,
    "form_settings" "jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."c_category_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."c_category_master" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "category_name" character varying(100) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "is_active" boolean DEFAULT true,
    "description" "text",
    "icon_name" character varying(50),
    "order_sequence" integer,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."c_category_master" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "company" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text" NOT NULL,
    "industry" "text",
    "source" "text" DEFAULT 'expo_qr'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_block_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid",
    "version" integer DEFAULT 1,
    "name" character varying(255),
    "description" "text",
    "icon" character varying(100),
    "sort_order" smallint,
    "active" boolean DEFAULT true
);


ALTER TABLE "public"."m_block_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_block_masters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid",
    "version" integer DEFAULT 1,
    "category_id" "uuid",
    "name" character varying(255),
    "description" "text",
    "icon" character varying(100),
    "node_type" character varying(100),
    "config" "jsonb",
    "theme_styles" "jsonb",
    "can_rotate" boolean DEFAULT false,
    "can_resize" boolean DEFAULT false,
    "is_bidirectional" boolean DEFAULT false,
    "icon_names" "text"[],
    "hex_color" character varying(7),
    "border_style" character varying(50),
    "active" boolean DEFAULT true
);


ALTER TABLE "public"."m_block_masters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_block_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid",
    "version" integer DEFAULT 1,
    "block_id" "uuid",
    "name" character varying(255),
    "description" "text",
    "node_type" character varying(100),
    "default_config" "jsonb",
    "active" boolean DEFAULT true
);


ALTER TABLE "public"."m_block_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_catalog_categories" (
    "id" character varying(100) NOT NULL,
    "industry_id" character varying(50) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "icon" character varying(50),
    "default_pricing_model" character varying(30) DEFAULT 'per_session'::character varying,
    "suggested_duration" integer,
    "common_variants" "jsonb" DEFAULT '[]'::"jsonb",
    "pricing_rule_templates" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "valid_category_id" CHECK ((("id")::"text" ~ '^[a-z][a-z0-9_]*$'::"text")),
    CONSTRAINT "valid_pricing_model" CHECK ((("default_pricing_model")::"text" = ANY ((ARRAY['per_session'::character varying, 'per_hour'::character varying, 'fixed'::character varying, 'monthly'::character varying, 'package'::character varying, 'per_unit'::character varying, 'subscription'::character varying, 'hourly'::character varying, 'daily'::character varying])::"text"[])))
);


ALTER TABLE "public"."m_catalog_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."m_catalog_categories" IS 'Master categories within each industry. Contains business intelligence like default pricing models, common variants, and suggested configurations to help tenants set up their catalogs quickly.';



COMMENT ON COLUMN "public"."m_catalog_categories"."pricing_rule_templates" IS 'Array of pricing rule templates specific to this category. More specific than industry-wide rules.';



CREATE TABLE IF NOT EXISTS "public"."m_catalog_category_industry_map" (
    "category_id" character varying NOT NULL,
    "industry_id" character varying NOT NULL,
    "is_primary" boolean DEFAULT false,
    "display_name" character varying,
    "display_order" integer DEFAULT 999,
    "is_active" boolean DEFAULT true,
    "customizations" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."m_catalog_category_industry_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_catalog_industries" (
    "id" character varying(50) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "icon" character varying(50),
    "common_pricing_rules" "jsonb" DEFAULT '[]'::"jsonb",
    "compliance_requirements" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "valid_industry_id" CHECK ((("id")::"text" ~ '^[a-z][a-z0-9_]*$'::"text"))
);


ALTER TABLE "public"."m_catalog_industries" OWNER TO "postgres";


COMMENT ON TABLE "public"."m_catalog_industries" IS 'Master table containing global industry templates for tenant onboarding. Industries like healthcare, wellness, manufacturing with their metadata and common patterns.';



COMMENT ON COLUMN "public"."m_catalog_industries"."common_pricing_rules" IS 'Array of common pricing patterns for this industry. Used during onboarding to suggest pricing strategies.';



CREATE TABLE IF NOT EXISTS "public"."m_catalog_pricing_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "industry_id" character varying(50) NOT NULL,
    "category_id" character varying(100),
    "template_name" character varying(255) NOT NULL,
    "template_description" "text",
    "rule_type" character varying(50) NOT NULL,
    "condition_config" "jsonb" NOT NULL,
    "action_config" "jsonb" NOT NULL,
    "popularity_score" integer DEFAULT 0,
    "is_recommended" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "valid_action_config" CHECK (("jsonb_typeof"("action_config") = 'object'::"text")),
    CONSTRAINT "valid_condition_config" CHECK (("jsonb_typeof"("condition_config") = 'object'::"text")),
    CONSTRAINT "valid_pricing_template_config" CHECK ("public"."validate_pricing_template_config"("rule_type", "condition_config", "action_config")),
    CONSTRAINT "valid_rule_type" CHECK ((("rule_type")::"text" = ANY ((ARRAY['time_based'::character varying, 'quantity_based'::character varying, 'customer_based'::character varying, 'date_based'::character varying, 'location_based'::character varying, 'seasonal'::character varying])::"text"[])))
);


ALTER TABLE "public"."m_catalog_pricing_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."m_catalog_pricing_templates" IS 'Reusable pricing rule templates that tenants can apply to their services. Contains common patterns like peak hour pricing, bulk discounts, seasonal adjustments per industry.';



COMMENT ON COLUMN "public"."m_catalog_pricing_templates"."popularity_score" IS 'Tracking metric for how often this template is used. Higher scores indicate more popular/successful templates.';



CREATE TABLE IF NOT EXISTS "public"."m_catalog_resource_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "industry_id" character varying(50) NOT NULL,
    "resource_type_id" character varying(50) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "default_attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "pricing_guidance" "jsonb" DEFAULT '{}'::"jsonb",
    "popularity_score" integer DEFAULT 0,
    "is_recommended" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."m_catalog_resource_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_catalog_resource_types" (
    "id" character varying(50) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "icon" character varying(50),
    "pricing_model" character varying(30) DEFAULT 'fixed'::character varying,
    "requires_human_assignment" boolean DEFAULT false,
    "has_capacity_limits" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_pricing_model" CHECK ((("pricing_model")::"text" = ANY ((ARRAY['fixed'::character varying, 'hourly'::character varying, 'per_use'::character varying, 'monthly'::character varying, 'daily'::character varying, 'per_unit'::character varying])::"text"[]))),
    CONSTRAINT "valid_resource_type_id" CHECK ((("id")::"text" ~ '^[a-z][a-z0-9_]*$'::"text"))
);


ALTER TABLE "public"."m_catalog_resource_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_category_details" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sub_cat_name" character varying(100) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "category_id" "uuid",
    "hexcolor" character varying(10),
    "icon_name" character varying(50),
    "tags" "jsonb",
    "tool_tip" "text",
    "is_active" boolean DEFAULT true,
    "sequence_no" integer DEFAULT 0,
    "description" "text",
    "is_deletable" boolean DEFAULT true,
    "form_settings" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "requires_human" boolean DEFAULT false
);


ALTER TABLE "public"."m_category_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_category_master" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "category_name" character varying(100) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "is_active" boolean DEFAULT true,
    "description" "text",
    "icon_name" character varying(50),
    "sequence_no" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."m_category_master" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m_permissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "resource" character varying(50) NOT NULL,
    "action" character varying(20) NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "m_permissions_action_check" CHECK ((("action")::"text" = ANY (ARRAY[('create'::character varying)::"text", ('read'::character varying)::"text", ('update'::character varying)::"text", ('delete'::character varying)::"text", ('manage'::character varying)::"text"])))
);


ALTER TABLE "public"."m_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_code" character varying(50) NOT NULL,
    "name" character varying(255) NOT NULL,
    "api_key" character varying(255) NOT NULL,
    "webhook_url" character varying(500),
    "webhook_secret" character varying(255),
    "is_active" boolean DEFAULT true,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."n_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "channel" character varying(20) NOT NULL,
    "recipient" character varying(255) NOT NULL,
    "provider" character varying(50),
    "provider_message_id" character varying(255),
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "status_details" "jsonb",
    "sent_at" timestamp without time zone,
    "delivered_at" timestamp without time zone,
    "failed_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."n_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_code" character varying(50) NOT NULL,
    "external_event_id" character varying(255),
    "external_tenant_id" character varying(255),
    "external_user_id" character varying(255),
    "event_type" character varying(100) NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" character varying(50) DEFAULT 'received'::character varying,
    "error_message" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "processed_at" timestamp without time zone,
    "completed_at" timestamp without time zone
);


ALTER TABLE "public"."n_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n_platform_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" character varying(20) NOT NULL,
    "provider_name" character varying(50) NOT NULL,
    "is_primary" boolean DEFAULT false,
    "config" "jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."n_platform_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_code" character varying(50),
    "template_key" character varying(100) NOT NULL,
    "channel" character varying(20) NOT NULL,
    "subject" character varying(500),
    "content" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."n_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n_tenant_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email_enabled" boolean DEFAULT true,
    "sms_enabled" boolean DEFAULT false,
    "whatsapp_enabled" boolean DEFAULT false,
    "inapp_enabled" boolean DEFAULT true,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."n_tenant_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "action" character varying(100) NOT NULL,
    "resource" character varying(100) NOT NULL,
    "resource_id" character varying(255),
    "metadata" "jsonb",
    "ip_address" character varying(45),
    "user_agent" "text",
    "success" boolean DEFAULT true,
    "error_message" "text",
    "severity" character varying(20) DEFAULT 'info'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "session_id" character varying(255),
    "correlation_id" character varying(255)
);


ALTER TABLE "public"."t_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_bm_feature_reference" (
    "feature_id" character varying(255) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "is_special_feature" boolean DEFAULT false NOT NULL,
    "default_limit" integer DEFAULT 0 NOT NULL,
    "trial_limit" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."t_bm_feature_reference" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_bm_invoice" (
    "invoice_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency_code" character varying(3) NOT NULL,
    "status" character varying(20) NOT NULL,
    "due_date" timestamp with time zone NOT NULL,
    "paid_date" timestamp with time zone,
    "description" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "t_bm_invoice_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('paid'::character varying)::"text", ('pending'::character varying)::"text", ('overdue'::character varying)::"text"])))
);


ALTER TABLE "public"."t_bm_invoice" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_bm_notification_reference" (
    "notif_type" character varying(255) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "categories" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."t_bm_notification_reference" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_bm_plan_version" (
    "version_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "version_number" character varying(10) NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "effective_date" "date" NOT NULL,
    "changelog" "text",
    "created_by" character varying(255) NOT NULL,
    "tiers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notifications" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "topup_options" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "chk_topup_options_is_array" CHECK (("jsonb_typeof"("topup_options") = 'array'::"text"))
);


ALTER TABLE "public"."t_bm_plan_version" OWNER TO "postgres";


COMMENT ON COLUMN "public"."t_bm_plan_version"."topup_options" IS 'Array of top-up options configured for this plan version';



CREATE TABLE IF NOT EXISTS "public"."t_bm_pricing_plan" (
    "plan_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "plan_type" character varying(20) NOT NULL,
    "trial_duration" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT false NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "default_currency_code" character varying(3) NOT NULL,
    "supported_currencies" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "t_bm_pricing_plan_plan_type_check" CHECK ((("plan_type")::"text" = ANY (ARRAY[('Per User'::character varying)::"text", ('Per Contract'::character varying)::"text"])))
);


ALTER TABLE "public"."t_bm_pricing_plan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_bm_subscription_usage" (
    "usage_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "type" character varying(20) NOT NULL,
    "identifier" character varying(255) NOT NULL,
    "used_amount" integer DEFAULT 0 NOT NULL,
    "limit_amount" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "t_bm_subscription_usage_type_check" CHECK ((("type")::"text" = ANY (ARRAY[('feature'::character varying)::"text", ('notification'::character varying)::"text"])))
);


ALTER TABLE "public"."t_bm_subscription_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_bm_tenant_subscription" (
    "subscription_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "version_id" "uuid" NOT NULL,
    "status" character varying(20) NOT NULL,
    "currency_code" character varying(3) NOT NULL,
    "units" integer DEFAULT 1 NOT NULL,
    "current_tier" "jsonb" NOT NULL,
    "amount_per_billing" numeric(10,2) NOT NULL,
    "billing_cycle" character varying(20) NOT NULL,
    "start_date" timestamp with time zone NOT NULL,
    "renewal_date" timestamp with time zone NOT NULL,
    "trial_ends" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "t_bm_tenant_subscription_billing_cycle_check" CHECK ((("billing_cycle")::"text" = ANY (ARRAY[('monthly'::character varying)::"text", ('quarterly'::character varying)::"text", ('annually'::character varying)::"text"]))),
    CONSTRAINT "t_bm_tenant_subscription_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('active'::character varying)::"text", ('trial'::character varying)::"text", ('canceled'::character varying)::"text", ('expired'::character varying)::"text"])))
);


ALTER TABLE "public"."t_bm_tenant_subscription" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_catalog_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "industry_id" "uuid",
    "category_code" character varying(100) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "icon" character varying(50),
    "default_pricing_model" character varying(30) DEFAULT 'per_session'::character varying,
    "suggested_duration" integer,
    "common_variants" "jsonb" DEFAULT '[]'::"jsonb",
    "pricing_rule_templates" "jsonb" DEFAULT '[]'::"jsonb",
    "is_custom" boolean DEFAULT false,
    "master_category_id" character varying(100),
    "customization_notes" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."t_catalog_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_catalog_industries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "industry_code" character varying(50) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "icon" character varying(50),
    "common_pricing_rules" "jsonb" DEFAULT '[]'::"jsonb",
    "compliance_requirements" "jsonb" DEFAULT '[]'::"jsonb",
    "is_custom" boolean DEFAULT false,
    "master_industry_id" character varying(50),
    "customization_notes" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."t_catalog_industries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_catalog_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "short_description" "text",
    "description_content" "text",
    "description_format" character varying(20) DEFAULT 'markdown'::character varying,
    "type" character varying(50) DEFAULT 'service'::character varying,
    "industry_id" character varying(50),
    "category_id" character varying(50),
    "is_live" boolean DEFAULT false,
    "parent_id" "uuid",
    "is_variant" boolean DEFAULT false,
    "price_attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "tax_config" "jsonb" DEFAULT '{}'::"jsonb",
    "service_attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "resource_requirements" "jsonb" DEFAULT '{}'::"jsonb",
    "specifications" "jsonb" DEFAULT '{}'::"jsonb",
    "terms_content" "text",
    "terms_format" character varying(20) DEFAULT 'markdown'::character varying,
    "variant_attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "search_vector" "tsvector",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "status" boolean DEFAULT true NOT NULL,
    CONSTRAINT "valid_type" CHECK ((("type")::"text" = ANY ((ARRAY['service'::character varying, 'product'::character varying, 'bundle'::character varying])::"text"[])))
);


ALTER TABLE "public"."t_catalog_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."t_catalog_items"."status" IS 'Active status: true = active/visible, false = inactive/soft-deleted. Default is true.';



CREATE TABLE IF NOT EXISTS "public"."t_catalog_resource_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "pricing_type_id" "uuid",
    "base_rate" numeric(15,4) NOT NULL,
    "currency_code" character varying(3) DEFAULT 'INR'::character varying,
    "peak_hour_multiplier" numeric(3,2) DEFAULT 1.0,
    "weekend_multiplier" numeric(3,2) DEFAULT 1.0,
    "holiday_multiplier" numeric(3,2) DEFAULT 1.0,
    "min_quantity" integer DEFAULT 1,
    "max_quantity" integer,
    "effective_from" "date" DEFAULT CURRENT_DATE,
    "effective_to" "date",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_date_range" CHECK ((("effective_to" IS NULL) OR ("effective_to" >= "effective_from"))),
    CONSTRAINT "valid_multipliers" CHECK ((("peak_hour_multiplier" >= (0)::numeric) AND ("weekend_multiplier" >= (0)::numeric) AND ("holiday_multiplier" >= (0)::numeric)))
);


ALTER TABLE "public"."t_catalog_resource_pricing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_catalog_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "resource_type_id" character varying(50) NOT NULL,
    "is_available" boolean DEFAULT true,
    "capacity_per_day" integer,
    "capacity_per_hour" integer,
    "working_hours" "jsonb" DEFAULT '{}'::"jsonb",
    "skills" "jsonb" DEFAULT '[]'::"jsonb",
    "attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "location_id" "uuid",
    "is_mobile" boolean DEFAULT false,
    "service_radius_km" integer,
    "hourly_cost" numeric(15,4),
    "daily_cost" numeric(15,4),
    "currency_code" character varying(3) DEFAULT 'INR'::character varying,
    "status" character varying(20) DEFAULT 'active'::character varying,
    "is_live" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "sequence_no" integer,
    CONSTRAINT "valid_resource_status" CHECK ((("status")::"text" = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'maintenance'::character varying, 'retired'::character varying])::"text"[])))
);


ALTER TABLE "public"."t_catalog_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_catalog_service_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "resource_type_id" character varying(50) NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "allocation_type_id" "uuid",
    "quantity_required" integer DEFAULT 1,
    "duration_hours" numeric(5,2),
    "unit_cost" numeric(15,4),
    "currency_code" character varying(3) DEFAULT 'INR'::character varying,
    "is_billable" boolean DEFAULT true,
    "required_skills" "jsonb" DEFAULT '[]'::"jsonb",
    "required_attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "sequence_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."t_catalog_service_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_category_details" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sub_cat_name" character varying(100) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "category_id" "uuid",
    "hexcolor" character varying(10),
    "icon_name" character varying(50),
    "tags" "jsonb",
    "tool_tip" "text",
    "is_active" boolean DEFAULT true,
    "sequence_no" integer,
    "description" "text",
    "tenant_id" "uuid",
    "is_deletable" boolean DEFAULT true,
    "form_settings" "jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "is_live" boolean DEFAULT true
);


ALTER TABLE "public"."t_category_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_category_master" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "category_name" character varying(100) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "is_active" boolean DEFAULT true,
    "description" "text",
    "icon_name" character varying(50),
    "order_sequence" integer,
    "tenant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "is_live" boolean DEFAULT true
);


ALTER TABLE "public"."t_category_master" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_category_resources_master" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "resource_type_id" character varying NOT NULL,
    "name" character varying NOT NULL,
    "display_name" character varying NOT NULL,
    "description" "text",
    "hexcolor" character varying,
    "sequence_no" integer,
    "contact_id" "uuid",
    "tags" "jsonb",
    "form_settings" "jsonb",
    "is_active" boolean DEFAULT true,
    "is_deletable" boolean DEFAULT true,
    "is_live" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."t_category_resources_master" OWNER TO "postgres";


COMMENT ON TABLE "public"."t_category_resources_master" IS 'Master table for category resources (LOV-style resources)';



COMMENT ON COLUMN "public"."t_category_resources_master"."resource_type_id" IS 'References resource type (consumable, asset, equipment, etc.)';



COMMENT ON COLUMN "public"."t_category_resources_master"."name" IS 'Internal name for the resource';



COMMENT ON COLUMN "public"."t_category_resources_master"."display_name" IS 'Human-readable display name';



COMMENT ON COLUMN "public"."t_category_resources_master"."contact_id" IS 'Optional reference to contact for human resources';



CREATE TABLE IF NOT EXISTS "public"."t_contact_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "type" character varying(20) NOT NULL,
    "label" character varying(100),
    "address_line1" character varying(200) NOT NULL,
    "address_line2" character varying(200),
    "city" character varying(100) NOT NULL,
    "state_code" character varying(50),
    "country_code" character varying(5) DEFAULT 'IN'::character varying NOT NULL,
    "postal_code" character varying(20),
    "google_pin" "text",
    "is_primary" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "t_contact_addresses_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['home'::character varying, 'office'::character varying, 'billing'::character varying, 'shipping'::character varying, 'factory'::character varying, 'warehouse'::character varying, 'other'::character varying])::"text"[])))
);


ALTER TABLE "public"."t_contact_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_contact_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "channel_type" character varying(20) NOT NULL,
    "value" character varying(200) NOT NULL,
    "country_code" character varying(5),
    "is_primary" boolean DEFAULT false,
    "is_verified" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "t_contact_channels_type_check" CHECK ((("channel_type")::"text" = ANY ((ARRAY['mobile'::character varying, 'email'::character varying, 'whatsapp'::character varying, 'linkedin'::character varying, 'website'::character varying, 'telegram'::character varying, 'skype'::character varying])::"text"[]))),
    CONSTRAINT "t_contact_channels_value_check" CHECK (("length"(TRIM(BOTH FROM "value")) > 0))
);


ALTER TABLE "public"."t_contact_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "auth_user_id" "uuid",
    "t_userprofile_id" "uuid",
    "parent_contact_id" "uuid",
    "type" character varying(20) NOT NULL,
    "status" character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "salutation" character varying(10),
    "name" character varying(100),
    "company_name" character varying(100),
    "registration_number" character varying(50),
    "designation" character varying(100),
    "department" character varying(100),
    "is_primary_contact" boolean DEFAULT false,
    "classifications" "jsonb" DEFAULT '[]'::"jsonb",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "compliance_numbers" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "potential_duplicate" boolean DEFAULT false,
    "duplicate_reasons" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    "is_live" boolean DEFAULT true,
    "parent_contact_ids" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "check_parent_contact_ids_is_array" CHECK (("jsonb_typeof"("parent_contact_ids") = 'array'::"text")),
    CONSTRAINT "t_contacts_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'archived'::character varying])::"text"[]))),
    CONSTRAINT "t_contacts_tenant_id_check" CHECK (("tenant_id" IS NOT NULL)),
    CONSTRAINT "t_contacts_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['individual'::character varying, 'corporate'::character varying, 'contact_person'::character varying])::"text"[]))),
    CONSTRAINT "t_contacts_type_name_check" CHECK ((((("type")::"text" = 'individual'::"text") AND ("name" IS NOT NULL) AND ("company_name" IS NULL)) OR ((("type")::"text" = 'corporate'::"text") AND ("company_name" IS NOT NULL) AND ("name" IS NULL)) OR ((("type")::"text" = 'contact_person'::"text") AND ("name" IS NOT NULL) AND ("parent_contact_id" IS NOT NULL))))
);


ALTER TABLE "public"."t_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_domain_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "domain_encrypted" "text" NOT NULL,
    "domain_hash" character varying(64) NOT NULL,
    "config_encrypted" "text" NOT NULL,
    "region" character varying(50) NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."t_domain_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_idempotency_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idempotency_key" character varying(255) NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "operation_type" character varying(50) NOT NULL,
    "service_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."t_idempotency_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_integration_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "config_schema" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."t_integration_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_integration_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "icon_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."t_integration_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_invitation_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invitation_id" "uuid" NOT NULL,
    "action" character varying(50) NOT NULL,
    "performed_by" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "t_invitation_audit_log_action_check" CHECK ((("action")::"text" = ANY ((ARRAY['created'::character varying, 'sent'::character varying, 'resent'::character varying, 'opened'::character varying, 'clicked'::character varying, 'validated'::character varying, 'accepted'::character varying, 'cancelled'::character varying, 'expired'::character varying, 'delivery_failed'::character varying, 'delivery_bounced'::character varying])::"text"[])))
);


ALTER TABLE "public"."t_invitation_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."t_invitation_audit_log" IS 'Audit trail for all invitation-related actions';



COMMENT ON COLUMN "public"."t_invitation_audit_log"."metadata" IS 'JSON field for storing action-specific details like IP, user agent, etc.';



CREATE TABLE IF NOT EXISTS "public"."t_onboarding_step_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "step_id" character varying(50) NOT NULL,
    "step_sequence" integer NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "attempts" integer DEFAULT 0,
    "error_log" "jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."t_onboarding_step_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_role_permissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "role_id" "uuid",
    "permission_id" "uuid",
    "tenant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."t_role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tax_info" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "tax_id_type" character varying(20) NOT NULL,
    "tax_id_value" character varying(50) NOT NULL,
    "is_verified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."t_tax_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tax_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "rate" numeric(5,2) NOT NULL,
    "description" "text",
    "sequence_no" integer DEFAULT 10,
    "is_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."t_tax_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tax_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "display_mode" character varying(20) DEFAULT 'excluding_tax'::character varying NOT NULL,
    "default_tax_rate_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "t_tax_settings_display_mode_check" CHECK ((("display_mode")::"text" = ANY ((ARRAY['including_tax'::character varying, 'excluding_tax'::character varying])::"text"[])))
);


ALTER TABLE "public"."t_tax_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."t_tax_settings" IS 'Tenant-specific tax configuration settings including display mode and default rate';



COMMENT ON COLUMN "public"."t_tax_settings"."display_mode" IS 'How prices are displayed: including_tax or excluding_tax';



COMMENT ON COLUMN "public"."t_tax_settings"."default_tax_rate_id" IS 'Reference to the default tax rate for this tenant';



COMMENT ON COLUMN "public"."t_tax_settings"."version" IS 'Optimistic locking version number';



CREATE TABLE IF NOT EXISTS "public"."t_tenant_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "domain_encrypted" "text" NOT NULL,
    "domain_hash" character varying(64) NOT NULL,
    "domain_mapping_id" "uuid",
    "is_primary" boolean DEFAULT false,
    "ssl_configured" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."t_tenant_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tenant_files" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "file_type" "text" NOT NULL,
    "file_category" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "download_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."t_tenant_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tenant_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "master_integration_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_live" boolean DEFAULT true NOT NULL,
    "credentials" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "connection_status" "text" DEFAULT 'Not Configured'::"text" NOT NULL,
    "last_verified" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."t_tenant_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tenant_onboarding" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "onboarding_type" character varying(20) DEFAULT 'business'::character varying,
    "current_step" integer DEFAULT 1,
    "total_steps" integer DEFAULT 6,
    "completed_steps" "jsonb" DEFAULT '[]'::"jsonb",
    "skipped_steps" "jsonb" DEFAULT '[]'::"jsonb",
    "step_data" "jsonb" DEFAULT '{}'::"jsonb",
    "started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "completed_at" timestamp with time zone,
    "is_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."t_tenant_onboarding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tenant_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "profile_type" character varying(20) NOT NULL,
    "business_name" character varying(255),
    "business_email" character varying(255),
    "business_phone_country_code" character varying(5),
    "business_phone" character varying(15),
    "country_code" character varying(5),
    "state_code" character varying(10),
    "address_line1" character varying(255),
    "address_line2" character varying(255),
    "city" character varying(100),
    "postal_code" character varying(20),
    "logo_url" character varying(255),
    "primary_color" character varying(10),
    "secondary_color" character varying(10),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "industry_id" character varying,
    "website_url" character varying,
    "business_type_id" character varying
);


ALTER TABLE "public"."t_tenant_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tenant_regions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "region" character varying(50) NOT NULL,
    "config_encrypted" "text" NOT NULL,
    "is_primary" boolean DEFAULT false,
    "data_scope" "text"[] DEFAULT ARRAY['all'::"text"],
    "sync_status" character varying(50) DEFAULT 'active'::character varying,
    "last_sync_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."t_tenant_regions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "domain" character varying(255),
    "workspace_code" character varying(20) NOT NULL,
    "plan_id" "uuid",
    "status" character varying(20) NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "created_by" "uuid",
    "is_admin" boolean DEFAULT false,
    "storage_path" "text",
    "storage_quota" integer DEFAULT 40 NOT NULL,
    "storage_consumed" integer DEFAULT 0 NOT NULL,
    "storage_provider" "text" DEFAULT 'firebase'::"text" NOT NULL,
    "storage_setup_complete" boolean DEFAULT false NOT NULL,
    CONSTRAINT "t_tenants_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('active'::character varying)::"text", ('inactive'::character varying)::"text", ('suspended'::character varying)::"text", ('trial'::character varying)::"text"])))
);


ALTER TABLE "public"."t_tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_user_auth_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "auth_type" character varying(50) NOT NULL,
    "auth_identifier" character varying(255) NOT NULL,
    "is_primary" boolean DEFAULT false,
    "is_verified" boolean DEFAULT true,
    "linked_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "t_user_auth_methods_auth_type_check" CHECK ((("auth_type")::"text" = ANY ((ARRAY['email'::character varying, 'google'::character varying, 'github'::character varying, 'microsoft'::character varying, 'apple'::character varying])::"text"[])))
);


ALTER TABLE "public"."t_user_auth_methods" OWNER TO "postgres";


COMMENT ON TABLE "public"."t_user_auth_methods" IS 'Tracks multiple authentication methods per user for OAuth and traditional login';



CREATE TABLE IF NOT EXISTS "public"."t_user_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_code" character varying(20) NOT NULL,
    "secret_code" character varying(10) NOT NULL,
    "email" character varying(255),
    "mobile_number" character varying(20),
    "invitation_method" character varying(20) DEFAULT 'email'::character varying NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "accepted_by" "uuid",
    "cancelled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" NOT NULL,
    "sent_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "resent_count" integer DEFAULT 0,
    "last_resent_at" timestamp with time zone,
    "last_resent_by" "uuid",
    "email_opened_at" timestamp with time zone,
    "link_clicked_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "email_or_mobile_required" CHECK ((("email" IS NOT NULL) OR ("mobile_number" IS NOT NULL))),
    CONSTRAINT "t_user_invitations_invitation_method_check" CHECK ((("invitation_method")::"text" = ANY ((ARRAY['email'::character varying, 'sms'::character varying, 'whatsapp'::character varying])::"text"[]))),
    CONSTRAINT "t_user_invitations_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'resent'::character varying, 'accepted'::character varying, 'expired'::character varying, 'cancelled'::character varying])::"text"[])))
);


ALTER TABLE "public"."t_user_invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."t_user_invitations" IS 'Stores user invitations for workspace access';



COMMENT ON COLUMN "public"."t_user_invitations"."status" IS 'Current status: pending, sent, resent, accepted, expired, cancelled';



COMMENT ON COLUMN "public"."t_user_invitations"."metadata" IS 'JSON field for storing delivery info, role assignments, custom messages, etc.';



CREATE TABLE IF NOT EXISTS "public"."t_user_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "first_name" character varying(100) NOT NULL,
    "last_name" character varying(100) NOT NULL,
    "email" character varying(255) NOT NULL,
    "country_code" character varying(5),
    "mobile_number" character varying(15),
    "user_code" character varying(8) NOT NULL,
    "avatar_url" character varying(255),
    "preferred_theme" character varying(50),
    "is_dark_mode" boolean DEFAULT false,
    "preferred_language" character varying(10) DEFAULT 'en'::character varying,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "is_admin" boolean DEFAULT false
);


ALTER TABLE "public"."t_user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_user_tenant_roles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_tenant_id" "uuid",
    "role_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."t_user_tenant_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."t_user_tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "tenant_id" "uuid",
    "is_default" boolean DEFAULT false,
    "status" character varying(20) NOT NULL,
    "invitation_token" character varying(100),
    "invitation_expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "is_admin" boolean DEFAULT false,
    CONSTRAINT "t_user_tenants_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('active'::character varying)::"text", ('invited'::character varying)::"text", ('inactive'::character varying)::"text"])))
);


ALTER TABLE "public"."t_user_tenants" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_audit_logs_detailed" WITH ("security_invoker"='true') AS
 SELECT "al"."id",
    "al"."tenant_id",
    "al"."user_id",
    "al"."action",
    "al"."resource",
    "al"."resource_id",
    "al"."metadata",
    "al"."ip_address",
    "al"."user_agent",
    "al"."success",
    "al"."error_message",
    "al"."severity",
    "al"."created_at",
    "al"."session_id",
    "al"."correlation_id",
    ((("up"."first_name")::"text" || ' '::"text") || ("up"."last_name")::"text") AS "user_name",
    "up"."email" AS "user_email",
    "up"."user_code",
    "t"."name" AS "tenant_name",
    "t"."workspace_code" AS "tenant_code",
    "public"."is_tenant_admin"("al"."tenant_id") AS "can_manage"
   FROM (("public"."t_audit_logs" "al"
     LEFT JOIN "public"."t_user_profiles" "up" ON (("al"."user_id" = "up"."user_id")))
     LEFT JOIN "public"."t_tenants" "t" ON (("al"."tenant_id" = "t"."id")));


ALTER TABLE "public"."v_audit_logs_detailed" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_onboarding_master_data" AS
 SELECT "mi"."id" AS "industry_id",
    "mi"."name" AS "industry_name",
    "mi"."icon" AS "industry_icon",
    "mi"."description" AS "industry_description",
    "count"("mc"."id") AS "category_count",
    "jsonb_agg"("jsonb_build_object"('id', "mc"."id", 'name', "mc"."name", 'icon', "mc"."icon", 'default_pricing_model', "mc"."default_pricing_model", 'common_variants', "mc"."common_variants") ORDER BY "mc"."sort_order") AS "categories"
   FROM ("public"."m_catalog_industries" "mi"
     LEFT JOIN "public"."m_catalog_categories" "mc" ON (((("mi"."id")::"text" = ("mc"."industry_id")::"text") AND ("mc"."is_active" = true))))
  WHERE ("mi"."is_active" = true)
  GROUP BY "mi"."id", "mi"."name", "mi"."icon", "mi"."description", "mi"."sort_order"
  ORDER BY "mi"."sort_order";


ALTER TABLE "public"."v_onboarding_master_data" OWNER TO "postgres";


ALTER TABLE ONLY "public"."c_category_details"
    ADD CONSTRAINT "c_category_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."c_category_details"
    ADD CONSTRAINT "c_category_details_sub_cat_name_category_id_key" UNIQUE ("sub_cat_name", "category_id");



ALTER TABLE ONLY "public"."c_category_master"
    ADD CONSTRAINT "c_category_master_category_name_key" UNIQUE ("category_name");



ALTER TABLE ONLY "public"."c_category_master"
    ADD CONSTRAINT "c_category_master_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_block_categories"
    ADD CONSTRAINT "m_block_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_block_masters"
    ADD CONSTRAINT "m_block_masters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_block_variants"
    ADD CONSTRAINT "m_block_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_catalog_categories"
    ADD CONSTRAINT "m_catalog_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_catalog_category_industry_map"
    ADD CONSTRAINT "m_catalog_category_industry_map_pkey" PRIMARY KEY ("category_id", "industry_id");



ALTER TABLE ONLY "public"."m_catalog_industries"
    ADD CONSTRAINT "m_catalog_industries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_catalog_pricing_templates"
    ADD CONSTRAINT "m_catalog_pricing_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_catalog_resource_templates"
    ADD CONSTRAINT "m_catalog_resource_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_catalog_resource_types"
    ADD CONSTRAINT "m_catalog_resource_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_category_details"
    ADD CONSTRAINT "m_category_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_category_details"
    ADD CONSTRAINT "m_category_details_sub_cat_name_category_id_key" UNIQUE ("sub_cat_name", "category_id");



ALTER TABLE ONLY "public"."m_category_master"
    ADD CONSTRAINT "m_category_master_category_name_key" UNIQUE ("category_name");



ALTER TABLE ONLY "public"."m_category_master"
    ADD CONSTRAINT "m_category_master_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_permissions"
    ADD CONSTRAINT "m_permissions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."m_permissions"
    ADD CONSTRAINT "m_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m_permissions"
    ADD CONSTRAINT "m_permissions_resource_action_key" UNIQUE ("resource", "action");



ALTER TABLE ONLY "public"."n_customers"
    ADD CONSTRAINT "n_customers_customer_code_key" UNIQUE ("customer_code");



ALTER TABLE ONLY "public"."n_customers"
    ADD CONSTRAINT "n_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n_deliveries"
    ADD CONSTRAINT "n_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n_events"
    ADD CONSTRAINT "n_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n_platform_providers"
    ADD CONSTRAINT "n_platform_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n_templates"
    ADD CONSTRAINT "n_templates_customer_code_template_key_channel_key" UNIQUE ("customer_code", "template_key", "channel");



ALTER TABLE ONLY "public"."n_templates"
    ADD CONSTRAINT "n_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n_tenant_preferences"
    ADD CONSTRAINT "n_tenant_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n_tenant_preferences"
    ADD CONSTRAINT "n_tenant_preferences_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."t_audit_logs"
    ADD CONSTRAINT "t_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_bm_feature_reference"
    ADD CONSTRAINT "t_bm_feature_reference_pkey" PRIMARY KEY ("feature_id");



ALTER TABLE ONLY "public"."t_bm_invoice"
    ADD CONSTRAINT "t_bm_invoice_pkey" PRIMARY KEY ("invoice_id");



ALTER TABLE ONLY "public"."t_bm_notification_reference"
    ADD CONSTRAINT "t_bm_notification_reference_pkey" PRIMARY KEY ("notif_type");



ALTER TABLE ONLY "public"."t_bm_plan_version"
    ADD CONSTRAINT "t_bm_plan_version_pkey" PRIMARY KEY ("version_id");



ALTER TABLE ONLY "public"."t_bm_plan_version"
    ADD CONSTRAINT "t_bm_plan_version_plan_id_version_number_key" UNIQUE ("plan_id", "version_number");



ALTER TABLE ONLY "public"."t_bm_pricing_plan"
    ADD CONSTRAINT "t_bm_pricing_plan_pkey" PRIMARY KEY ("plan_id");



ALTER TABLE ONLY "public"."t_bm_subscription_usage"
    ADD CONSTRAINT "t_bm_subscription_usage_pkey" PRIMARY KEY ("usage_id");



ALTER TABLE ONLY "public"."t_bm_tenant_subscription"
    ADD CONSTRAINT "t_bm_tenant_subscription_pkey" PRIMARY KEY ("subscription_id");



ALTER TABLE ONLY "public"."t_catalog_categories"
    ADD CONSTRAINT "t_catalog_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_catalog_industries"
    ADD CONSTRAINT "t_catalog_industries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_catalog_items"
    ADD CONSTRAINT "t_catalog_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_catalog_resource_pricing"
    ADD CONSTRAINT "t_catalog_resource_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_catalog_resources"
    ADD CONSTRAINT "t_catalog_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_catalog_service_resources"
    ADD CONSTRAINT "t_catalog_service_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_category_details"
    ADD CONSTRAINT "t_category_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_category_details"
    ADD CONSTRAINT "t_category_details_sub_cat_name_category_id_tenant_id_key" UNIQUE ("sub_cat_name", "category_id", "tenant_id");



ALTER TABLE ONLY "public"."t_category_master"
    ADD CONSTRAINT "t_category_master_category_name_tenant_id_key" UNIQUE ("category_name", "tenant_id");



ALTER TABLE ONLY "public"."t_category_master"
    ADD CONSTRAINT "t_category_master_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_category_resources_master"
    ADD CONSTRAINT "t_category_resources_master_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_category_resources_master"
    ADD CONSTRAINT "t_category_resources_master_tenant_id_idx" UNIQUE ("tenant_id", "resource_type_id", "name");



ALTER TABLE ONLY "public"."t_contact_addresses"
    ADD CONSTRAINT "t_contact_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_contact_channels"
    ADD CONSTRAINT "t_contact_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_contacts"
    ADD CONSTRAINT "t_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_domain_mappings"
    ADD CONSTRAINT "t_domain_mappings_domain_hash_key" UNIQUE ("domain_hash");



ALTER TABLE ONLY "public"."t_domain_mappings"
    ADD CONSTRAINT "t_domain_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_idempotency_keys"
    ADD CONSTRAINT "t_idempotency_keys_idempotency_key_tenant_id_operation_type_key" UNIQUE ("idempotency_key", "tenant_id", "operation_type");



ALTER TABLE ONLY "public"."t_idempotency_keys"
    ADD CONSTRAINT "t_idempotency_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_integration_providers"
    ADD CONSTRAINT "t_integration_providers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."t_integration_providers"
    ADD CONSTRAINT "t_integration_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_integration_types"
    ADD CONSTRAINT "t_integration_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."t_integration_types"
    ADD CONSTRAINT "t_integration_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_invitation_audit_log"
    ADD CONSTRAINT "t_invitation_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_onboarding_step_status"
    ADD CONSTRAINT "t_onboarding_step_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_onboarding_step_status"
    ADD CONSTRAINT "t_onboarding_step_status_tenant_id_step_id_key" UNIQUE ("tenant_id", "step_id");



ALTER TABLE ONLY "public"."t_role_permissions"
    ADD CONSTRAINT "t_role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_role_permissions"
    ADD CONSTRAINT "t_role_permissions_role_id_permission_id_tenant_id_key" UNIQUE ("role_id", "permission_id", "tenant_id");



ALTER TABLE ONLY "public"."t_tax_info"
    ADD CONSTRAINT "t_tax_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tax_rates"
    ADD CONSTRAINT "t_tax_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tax_settings"
    ADD CONSTRAINT "t_tax_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tenant_domains"
    ADD CONSTRAINT "t_tenant_domains_domain_hash_key" UNIQUE ("domain_hash");



ALTER TABLE ONLY "public"."t_tenant_domains"
    ADD CONSTRAINT "t_tenant_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tenant_files"
    ADD CONSTRAINT "t_tenant_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tenant_integrations"
    ADD CONSTRAINT "t_tenant_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tenant_onboarding"
    ADD CONSTRAINT "t_tenant_onboarding_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tenant_profiles"
    ADD CONSTRAINT "t_tenant_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tenant_regions"
    ADD CONSTRAINT "t_tenant_regions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tenants"
    ADD CONSTRAINT "t_tenants_domain_key" UNIQUE ("domain");



ALTER TABLE ONLY "public"."t_tenants"
    ADD CONSTRAINT "t_tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_tenants"
    ADD CONSTRAINT "t_tenants_workspace_code_key" UNIQUE ("workspace_code");



ALTER TABLE ONLY "public"."t_user_auth_methods"
    ADD CONSTRAINT "t_user_auth_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_user_auth_methods"
    ADD CONSTRAINT "t_user_auth_methods_user_id_auth_type_auth_identifier_key" UNIQUE ("user_id", "auth_type", "auth_identifier");



ALTER TABLE ONLY "public"."t_user_invitations"
    ADD CONSTRAINT "t_user_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_user_profiles"
    ADD CONSTRAINT "t_user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_user_profiles"
    ADD CONSTRAINT "t_user_profiles_user_code_key" UNIQUE ("user_code");



ALTER TABLE ONLY "public"."t_user_tenant_roles"
    ADD CONSTRAINT "t_user_tenant_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_user_tenant_roles"
    ADD CONSTRAINT "t_user_tenant_roles_user_tenant_id_role_id_key" UNIQUE ("user_tenant_id", "role_id");



ALTER TABLE ONLY "public"."t_user_tenants"
    ADD CONSTRAINT "t_user_tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."t_user_tenants"
    ADD CONSTRAINT "t_user_tenants_user_id_tenant_id_key" UNIQUE ("user_id", "tenant_id");



ALTER TABLE ONLY "public"."m_catalog_categories"
    ADD CONSTRAINT "unique_category_per_industry" UNIQUE ("industry_id", "name");



ALTER TABLE ONLY "public"."t_catalog_categories"
    ADD CONSTRAINT "unique_category_per_tenant_industry" UNIQUE ("tenant_id", "industry_id", "category_code");



ALTER TABLE ONLY "public"."m_catalog_industries"
    ADD CONSTRAINT "unique_industry_name" UNIQUE ("name");



ALTER TABLE ONLY "public"."t_catalog_industries"
    ADD CONSTRAINT "unique_industry_per_tenant" UNIQUE ("tenant_id", "industry_code");



ALTER TABLE ONLY "public"."t_user_invitations"
    ADD CONSTRAINT "unique_invitation_codes" UNIQUE ("user_code", "secret_code");



ALTER TABLE ONLY "public"."t_catalog_resources"
    ADD CONSTRAINT "unique_resource_name_per_tenant" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."t_catalog_resource_pricing"
    ADD CONSTRAINT "unique_resource_pricing_period" UNIQUE ("resource_id", "pricing_type_id", "effective_from");



ALTER TABLE ONLY "public"."m_catalog_resource_templates"
    ADD CONSTRAINT "unique_resource_template" UNIQUE ("industry_id", "resource_type_id", "name");



ALTER TABLE ONLY "public"."t_catalog_service_resources"
    ADD CONSTRAINT "unique_service_resource_type" UNIQUE ("service_id", "resource_type_id", "tenant_id");



ALTER TABLE ONLY "public"."t_tenant_regions"
    ADD CONSTRAINT "unique_tenant_region" UNIQUE ("tenant_id", "region");



ALTER TABLE ONLY "public"."t_tax_settings"
    ADD CONSTRAINT "unique_tenant_tax_settings" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."t_user_profiles"
    ADD CONSTRAINT "unique_user_id" UNIQUE ("user_id");



CREATE INDEX "idx_audit_action" ON "public"."t_invitation_audit_log" USING "btree" ("action");



CREATE INDEX "idx_audit_invitation" ON "public"."t_invitation_audit_log" USING "btree" ("invitation_id");



CREATE INDEX "idx_audit_logs_action" ON "public"."t_audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."t_audit_logs" USING "btree" ("created_at");



CREATE INDEX "idx_audit_logs_resource" ON "public"."t_audit_logs" USING "btree" ("resource");



CREATE INDEX "idx_audit_logs_severity" ON "public"."t_audit_logs" USING "btree" ("severity");



CREATE INDEX "idx_audit_logs_tenant_id" ON "public"."t_audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_logs_user_id" ON "public"."t_audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_audit_performed_at" ON "public"."t_invitation_audit_log" USING "btree" ("performed_at");



CREATE INDEX "idx_block_categories_active" ON "public"."m_block_categories" USING "btree" ("active");



CREATE INDEX "idx_block_categories_sort" ON "public"."m_block_categories" USING "btree" ("sort_order");



CREATE INDEX "idx_block_masters_active" ON "public"."m_block_masters" USING "btree" ("active");



CREATE INDEX "idx_block_masters_category" ON "public"."m_block_masters" USING "btree" ("category_id");



CREATE INDEX "idx_block_variants_active" ON "public"."m_block_variants" USING "btree" ("active");



CREATE INDEX "idx_block_variants_block" ON "public"."m_block_variants" USING "btree" ("block_id");



CREATE INDEX "idx_catalog_items_industry_category" ON "public"."t_catalog_items" USING "btree" ("industry_id", "category_id") WHERE ("is_live" = true);



CREATE INDEX "idx_catalog_items_parent" ON "public"."t_catalog_items" USING "btree" ("parent_id") WHERE ("parent_id" IS NOT NULL);



CREATE INDEX "idx_catalog_items_search" ON "public"."t_catalog_items" USING "gin" ("search_vector");



CREATE INDEX "idx_catalog_resources_availability" ON "public"."t_catalog_resources" USING "btree" ("is_available", "status") WHERE ("is_live" = true);



CREATE INDEX "idx_catalog_resources_skills" ON "public"."t_catalog_resources" USING "gin" ("skills");



CREATE INDEX "idx_catalog_resources_tenant_type" ON "public"."t_catalog_resources" USING "btree" ("tenant_id", "resource_type_id", "status");



CREATE INDEX "idx_category_details_category" ON "public"."m_category_details" USING "btree" ("category_id", "is_active", "sequence_no");



CREATE INDEX "idx_category_master_active" ON "public"."m_category_master" USING "btree" ("category_name", "is_active");



CREATE INDEX "idx_contacts_classifications" ON "public"."t_contacts" USING "gin" ("classifications");



CREATE INDEX "idx_contacts_list_query" ON "public"."t_contacts" USING "btree" ("tenant_id", "is_live", "status", "type", "created_at");



CREATE INDEX "idx_contacts_parent_contact_ids" ON "public"."t_contacts" USING "gin" ("parent_contact_ids");



CREATE INDEX "idx_contacts_search" ON "public"."t_contacts" USING "gin" ("to_tsvector"('"english"'::"regconfig", (((COALESCE("name", ''::character varying))::"text" || ' '::"text") || (COALESCE("company_name", ''::character varying))::"text")));



CREATE INDEX "idx_contacts_tenant_env" ON "public"."t_contacts" USING "btree" ("tenant_id", "is_live") WHERE ("tenant_id" IS NOT NULL);



CREATE INDEX "idx_domain_mappings_hash" ON "public"."t_domain_mappings" USING "btree" ("domain_hash");



CREATE INDEX "idx_domain_mappings_region" ON "public"."t_domain_mappings" USING "btree" ("region");



CREATE INDEX "idx_idempotency_keys_cleanup" ON "public"."t_idempotency_keys" USING "btree" ("created_at");



CREATE INDEX "idx_invitations_codes" ON "public"."t_user_invitations" USING "btree" ("user_code", "secret_code");



CREATE INDEX "idx_invitations_email" ON "public"."t_user_invitations" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_invitations_expires" ON "public"."t_user_invitations" USING "btree" ("expires_at") WHERE (("status")::"text" = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'resent'::character varying])::"text"[]));



CREATE INDEX "idx_invitations_invited_by" ON "public"."t_user_invitations" USING "btree" ("invited_by");



CREATE INDEX "idx_invitations_mobile" ON "public"."t_user_invitations" USING "btree" ("mobile_number") WHERE ("mobile_number" IS NOT NULL);



CREATE INDEX "idx_invitations_tenant_status" ON "public"."t_user_invitations" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_invoice_created_at" ON "public"."t_bm_invoice" USING "btree" ("created_at");



CREATE INDEX "idx_invoice_due_date" ON "public"."t_bm_invoice" USING "btree" ("due_date");



CREATE INDEX "idx_invoice_items_gin" ON "public"."t_bm_invoice" USING "gin" ("items");



CREATE INDEX "idx_invoice_status" ON "public"."t_bm_invoice" USING "btree" ("status");



CREATE INDEX "idx_invoice_subscription_id" ON "public"."t_bm_invoice" USING "btree" ("subscription_id");



CREATE INDEX "idx_m_catalog_categories_industry" ON "public"."m_catalog_categories" USING "btree" ("industry_id", "is_active", "sort_order");



CREATE INDEX "idx_m_catalog_categories_pricing_model" ON "public"."m_catalog_categories" USING "btree" ("default_pricing_model");



CREATE INDEX "idx_m_catalog_categories_variants" ON "public"."m_catalog_categories" USING "gin" ("common_variants");



CREATE INDEX "idx_m_catalog_industries_active" ON "public"."m_catalog_industries" USING "btree" ("is_active", "sort_order");



CREATE INDEX "idx_m_catalog_industries_name" ON "public"."m_catalog_industries" USING "btree" ("name");



CREATE INDEX "idx_m_catalog_pricing_templates_category" ON "public"."m_catalog_pricing_templates" USING "btree" ("category_id", "is_active");



CREATE INDEX "idx_m_catalog_pricing_templates_industry" ON "public"."m_catalog_pricing_templates" USING "btree" ("industry_id", "is_active");



CREATE INDEX "idx_m_catalog_pricing_templates_recommended" ON "public"."m_catalog_pricing_templates" USING "btree" ("is_recommended", "popularity_score" DESC);



CREATE INDEX "idx_m_catalog_pricing_templates_rule_type" ON "public"."m_catalog_pricing_templates" USING "btree" ("rule_type");



CREATE INDEX "idx_m_catalog_resource_templates_industry" ON "public"."m_catalog_resource_templates" USING "btree" ("industry_id", "is_active");



CREATE INDEX "idx_m_catalog_resource_templates_recommended" ON "public"."m_catalog_resource_templates" USING "btree" ("is_recommended", "popularity_score" DESC);



CREATE INDEX "idx_m_catalog_resource_templates_type" ON "public"."m_catalog_resource_templates" USING "btree" ("resource_type_id", "is_active");



CREATE INDEX "idx_m_catalog_resource_types_active" ON "public"."m_catalog_resource_types" USING "btree" ("is_active", "sort_order");



CREATE INDEX "idx_n_deliveries_event" ON "public"."n_deliveries" USING "btree" ("event_id");



CREATE INDEX "idx_n_deliveries_provider" ON "public"."n_deliveries" USING "btree" ("provider", "provider_message_id");



CREATE INDEX "idx_n_events_customer" ON "public"."n_events" USING "btree" ("customer_code", "created_at" DESC);



CREATE INDEX "idx_n_events_external" ON "public"."n_events" USING "btree" ("customer_code", "external_event_id");



CREATE INDEX "idx_n_events_status" ON "public"."n_events" USING "btree" ("status", "created_at");



CREATE INDEX "idx_onboarding_step_tenant" ON "public"."t_onboarding_step_status" USING "btree" ("tenant_id");



CREATE INDEX "idx_plan_version_effective_date" ON "public"."t_bm_plan_version" USING "btree" ("effective_date");



CREATE INDEX "idx_plan_version_features_gin" ON "public"."t_bm_plan_version" USING "gin" ("features");



CREATE INDEX "idx_plan_version_is_active" ON "public"."t_bm_plan_version" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_plan_version_notifications_gin" ON "public"."t_bm_plan_version" USING "gin" ("notifications");



CREATE INDEX "idx_plan_version_plan_id" ON "public"."t_bm_plan_version" USING "btree" ("plan_id");



CREATE INDEX "idx_plan_version_tiers_gin" ON "public"."t_bm_plan_version" USING "gin" ("tiers");



CREATE INDEX "idx_pricing_plan_is_archived" ON "public"."t_bm_pricing_plan" USING "btree" ("is_archived") WHERE ("is_archived" = false);



CREATE INDEX "idx_pricing_plan_is_visible" ON "public"."t_bm_pricing_plan" USING "btree" ("is_visible") WHERE ("is_visible" = true);



CREATE INDEX "idx_pricing_plan_plan_type" ON "public"."t_bm_pricing_plan" USING "btree" ("plan_type");



CREATE INDEX "idx_resource_pricing_active" ON "public"."t_catalog_resource_pricing" USING "btree" ("resource_id", "is_active", "effective_from", "effective_to");



CREATE INDEX "idx_service_resources_resource_type" ON "public"."t_catalog_service_resources" USING "btree" ("resource_type_id", "tenant_id");



CREATE INDEX "idx_service_resources_service" ON "public"."t_catalog_service_resources" USING "btree" ("service_id", "is_active");



CREATE INDEX "idx_subscription_usage_subscription_id" ON "public"."t_bm_subscription_usage" USING "btree" ("subscription_id");



CREATE INDEX "idx_subscription_usage_type_identifier" ON "public"."t_bm_subscription_usage" USING "btree" ("type", "identifier");



CREATE INDEX "idx_t_contact_addresses_contact_id" ON "public"."t_contact_addresses" USING "btree" ("contact_id");



CREATE INDEX "idx_t_contact_addresses_primary" ON "public"."t_contact_addresses" USING "btree" ("contact_id", "is_primary") WHERE ("is_primary" = true);



CREATE INDEX "idx_t_contact_channels_contact_id" ON "public"."t_contact_channels" USING "btree" ("contact_id");



CREATE INDEX "idx_t_contact_channels_email" ON "public"."t_contact_channels" USING "btree" ("value") WHERE (("channel_type")::"text" = 'email'::"text");



CREATE INDEX "idx_t_contact_channels_mobile" ON "public"."t_contact_channels" USING "btree" ("value") WHERE (("channel_type")::"text" = 'mobile'::"text");



CREATE INDEX "idx_t_contact_channels_primary" ON "public"."t_contact_channels" USING "btree" ("contact_id", "is_primary") WHERE ("is_primary" = true);



CREATE INDEX "idx_t_contact_channels_value" ON "public"."t_contact_channels" USING "btree" ("value");



CREATE INDEX "idx_t_contacts_auth_user_id" ON "public"."t_contacts" USING "btree" ("auth_user_id");



CREATE INDEX "idx_t_contacts_classifications" ON "public"."t_contacts" USING "gin" ("classifications");



CREATE INDEX "idx_t_contacts_compliance" ON "public"."t_contacts" USING "gin" ("compliance_numbers");



CREATE INDEX "idx_t_contacts_parent_id" ON "public"."t_contacts" USING "btree" ("parent_contact_id");



CREATE INDEX "idx_t_contacts_potential_duplicate" ON "public"."t_contacts" USING "btree" ("potential_duplicate") WHERE ("potential_duplicate" = true);



CREATE INDEX "idx_t_contacts_search" ON "public"."t_contacts" USING "gin" ("to_tsvector"('"english"'::"regconfig", (((((COALESCE("name", ''::character varying))::"text" || ' '::"text") || (COALESCE("company_name", ''::character varying))::"text") || ' '::"text") || (COALESCE("designation", ''::character varying))::"text")));



CREATE INDEX "idx_t_contacts_status" ON "public"."t_contacts" USING "btree" ("status");



CREATE INDEX "idx_t_contacts_tags" ON "public"."t_contacts" USING "gin" ("tags");



CREATE INDEX "idx_t_contacts_tenant_id" ON "public"."t_contacts" USING "btree" ("tenant_id");



CREATE INDEX "idx_t_contacts_type" ON "public"."t_contacts" USING "btree" ("type");



CREATE INDEX "idx_tax_settings_tenant_id" ON "public"."t_tax_settings" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_domains_hash" ON "public"."t_tenant_domains" USING "btree" ("domain_hash");



CREATE INDEX "idx_tenant_domains_tenant" ON "public"."t_tenant_domains" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_files_category" ON "public"."t_tenant_files" USING "btree" ("file_category");



CREATE INDEX "idx_tenant_files_created_at" ON "public"."t_tenant_files" USING "btree" ("created_at");



CREATE INDEX "idx_tenant_files_metadata" ON "public"."t_tenant_files" USING "gin" ("metadata");



CREATE INDEX "idx_tenant_files_tenant_id" ON "public"."t_tenant_files" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_onboarding_tenant" ON "public"."t_tenant_onboarding" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_regions_region" ON "public"."t_tenant_regions" USING "btree" ("region");



CREATE INDEX "idx_tenant_regions_tenant" ON "public"."t_tenant_regions" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_subscription_current_tier_gin" ON "public"."t_bm_tenant_subscription" USING "gin" ("current_tier");



CREATE INDEX "idx_tenant_subscription_renewal_date" ON "public"."t_bm_tenant_subscription" USING "btree" ("renewal_date");



CREATE INDEX "idx_tenant_subscription_status" ON "public"."t_bm_tenant_subscription" USING "btree" ("status");



CREATE INDEX "idx_tenant_subscription_tenant_id" ON "public"."t_bm_tenant_subscription" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_subscription_trial_ends" ON "public"."t_bm_tenant_subscription" USING "btree" ("trial_ends");



CREATE INDEX "idx_tenant_subscription_version_id" ON "public"."t_bm_tenant_subscription" USING "btree" ("version_id");



CREATE INDEX "idx_user_auth_methods_auth_identifier" ON "public"."t_user_auth_methods" USING "btree" ("auth_identifier");



CREATE INDEX "idx_user_auth_methods_auth_type" ON "public"."t_user_auth_methods" USING "btree" ("auth_type");



CREATE INDEX "idx_user_auth_methods_user_id" ON "public"."t_user_auth_methods" USING "btree" ("user_id");



CREATE INDEX "t_category_resources_master_active_idx" ON "public"."t_category_resources_master" USING "btree" ("is_active", "is_live");



CREATE INDEX "t_category_resources_master_resource_type_idx" ON "public"."t_category_resources_master" USING "btree" ("resource_type_id");



CREATE INDEX "t_category_resources_master_sequence_idx" ON "public"."t_category_resources_master" USING "btree" ("sequence_no");



CREATE UNIQUE INDEX "unique_active_invitation_email" ON "public"."t_user_invitations" USING "btree" ("tenant_id", "email") WHERE ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'resent'::character varying])::"text"[])) AND ("email" IS NOT NULL));



CREATE UNIQUE INDEX "unique_active_invitation_mobile" ON "public"."t_user_invitations" USING "btree" ("tenant_id", "mobile_number") WHERE ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'resent'::character varying])::"text"[])) AND ("mobile_number" IS NOT NULL));



CREATE UNIQUE INDEX "unique_active_name_per_tenant" ON "public"."t_catalog_items" USING "btree" ("tenant_id", "name", "is_live") WHERE ("status" = true);



CREATE OR REPLACE TRIGGER "after_tenant_created" AFTER INSERT ON "public"."t_tenants" FOR EACH ROW EXECUTE FUNCTION "public"."initialize_tenant_onboarding"();



CREATE OR REPLACE TRIGGER "enforce_single_primary_auth_method" BEFORE INSERT OR UPDATE ON "public"."t_user_auth_methods" FOR EACH ROW WHEN (("new"."is_primary" = true)) EXECUTE FUNCTION "public"."ensure_single_primary_auth_method"();



CREATE OR REPLACE TRIGGER "m_catalog_categories_update_trigger" BEFORE UPDATE ON "public"."m_catalog_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_master_catalog_timestamp"();



CREATE OR REPLACE TRIGGER "m_catalog_industries_update_trigger" BEFORE UPDATE ON "public"."m_catalog_industries" FOR EACH ROW EXECUTE FUNCTION "public"."update_master_catalog_timestamp"();



CREATE OR REPLACE TRIGGER "m_catalog_pricing_templates_update_trigger" BEFORE UPDATE ON "public"."m_catalog_pricing_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_master_catalog_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_check_invitation_expiry" BEFORE INSERT OR UPDATE ON "public"."t_user_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."check_invitation_expiry"();



CREATE OR REPLACE TRIGGER "trigger_tax_settings_updated_at" BEFORE UPDATE ON "public"."t_tax_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_domain_mappings_updated_at" BEFORE UPDATE ON "public"."t_domain_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_t_contact_addresses_updated_at" BEFORE UPDATE ON "public"."t_contact_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_t_contact_channels_updated_at" BEFORE UPDATE ON "public"."t_contact_channels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_t_contacts_updated_at" BEFORE UPDATE ON "public"."t_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tenant_domains_updated_at" BEFORE UPDATE ON "public"."t_tenant_domains" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tenant_regions_updated_at" BEFORE UPDATE ON "public"."t_tenant_regions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_auth_methods_updated_at" BEFORE UPDATE ON "public"."t_user_auth_methods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."c_category_details"
    ADD CONSTRAINT "c_category_details_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."c_category_master"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m_catalog_categories"
    ADD CONSTRAINT "fk_category_industry" FOREIGN KEY ("industry_id") REFERENCES "public"."m_catalog_industries"("id");



ALTER TABLE ONLY "public"."m_catalog_pricing_templates"
    ADD CONSTRAINT "fk_pricing_template_category" FOREIGN KEY ("category_id") REFERENCES "public"."m_catalog_categories"("id");



ALTER TABLE ONLY "public"."m_catalog_pricing_templates"
    ADD CONSTRAINT "fk_pricing_template_industry" FOREIGN KEY ("industry_id") REFERENCES "public"."m_catalog_industries"("id");



ALTER TABLE ONLY "public"."m_block_categories"
    ADD CONSTRAINT "m_block_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."m_block_categories"("id");



ALTER TABLE ONLY "public"."m_block_masters"
    ADD CONSTRAINT "m_block_masters_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."m_block_categories"("id");



ALTER TABLE ONLY "public"."m_block_masters"
    ADD CONSTRAINT "m_block_masters_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."m_block_masters"("id");



ALTER TABLE ONLY "public"."m_block_variants"
    ADD CONSTRAINT "m_block_variants_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."m_block_masters"("id");



ALTER TABLE ONLY "public"."m_block_variants"
    ADD CONSTRAINT "m_block_variants_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."m_block_variants"("id");



ALTER TABLE ONLY "public"."m_catalog_category_industry_map"
    ADD CONSTRAINT "m_catalog_category_industry_map_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."m_catalog_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m_catalog_category_industry_map"
    ADD CONSTRAINT "m_catalog_category_industry_map_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "public"."m_catalog_industries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m_catalog_resource_templates"
    ADD CONSTRAINT "m_catalog_resource_templates_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "public"."m_catalog_industries"("id");



ALTER TABLE ONLY "public"."m_catalog_resource_templates"
    ADD CONSTRAINT "m_catalog_resource_templates_resource_type_id_fkey" FOREIGN KEY ("resource_type_id") REFERENCES "public"."m_catalog_resource_types"("id");



ALTER TABLE ONLY "public"."m_category_details"
    ADD CONSTRAINT "m_category_details_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."m_category_master"("id");



ALTER TABLE ONLY "public"."n_deliveries"
    ADD CONSTRAINT "n_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."n_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."n_events"
    ADD CONSTRAINT "n_events_customer_code_fkey" FOREIGN KEY ("customer_code") REFERENCES "public"."n_customers"("customer_code");



ALTER TABLE ONLY "public"."n_templates"
    ADD CONSTRAINT "n_templates_customer_code_fkey" FOREIGN KEY ("customer_code") REFERENCES "public"."n_customers"("customer_code");



ALTER TABLE ONLY "public"."n_tenant_preferences"
    ADD CONSTRAINT "n_tenant_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id");



ALTER TABLE ONLY "public"."t_audit_logs"
    ADD CONSTRAINT "t_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id");



ALTER TABLE ONLY "public"."t_audit_logs"
    ADD CONSTRAINT "t_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_bm_invoice"
    ADD CONSTRAINT "t_bm_invoice_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."t_bm_tenant_subscription"("subscription_id");



ALTER TABLE ONLY "public"."t_bm_plan_version"
    ADD CONSTRAINT "t_bm_plan_version_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."t_bm_pricing_plan"("plan_id");



ALTER TABLE ONLY "public"."t_bm_subscription_usage"
    ADD CONSTRAINT "t_bm_subscription_usage_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."t_bm_tenant_subscription"("subscription_id");



ALTER TABLE ONLY "public"."t_bm_tenant_subscription"
    ADD CONSTRAINT "t_bm_tenant_subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id");



ALTER TABLE ONLY "public"."t_bm_tenant_subscription"
    ADD CONSTRAINT "t_bm_tenant_subscription_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."t_bm_plan_version"("version_id");



ALTER TABLE ONLY "public"."t_catalog_categories"
    ADD CONSTRAINT "t_catalog_categories_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "public"."t_catalog_industries"("id");



ALTER TABLE ONLY "public"."t_catalog_items"
    ADD CONSTRAINT "t_catalog_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."m_catalog_categories"("id");



ALTER TABLE ONLY "public"."t_catalog_items"
    ADD CONSTRAINT "t_catalog_items_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "public"."m_catalog_industries"("id");



ALTER TABLE ONLY "public"."t_catalog_items"
    ADD CONSTRAINT "t_catalog_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."t_catalog_items"("id");



ALTER TABLE ONLY "public"."t_catalog_items"
    ADD CONSTRAINT "t_catalog_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_catalog_resource_pricing"
    ADD CONSTRAINT "t_catalog_resource_pricing_pricing_type_id_fkey" FOREIGN KEY ("pricing_type_id") REFERENCES "public"."m_category_details"("id");



ALTER TABLE ONLY "public"."t_catalog_resource_pricing"
    ADD CONSTRAINT "t_catalog_resource_pricing_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."t_catalog_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_catalog_resource_pricing"
    ADD CONSTRAINT "t_catalog_resource_pricing_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_catalog_resources"
    ADD CONSTRAINT "t_catalog_resources_resource_type_id_fkey" FOREIGN KEY ("resource_type_id") REFERENCES "public"."m_catalog_resource_types"("id");



ALTER TABLE ONLY "public"."t_catalog_resources"
    ADD CONSTRAINT "t_catalog_resources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_catalog_service_resources"
    ADD CONSTRAINT "t_catalog_service_resources_allocation_type_id_fkey" FOREIGN KEY ("allocation_type_id") REFERENCES "public"."m_category_details"("id");



ALTER TABLE ONLY "public"."t_catalog_service_resources"
    ADD CONSTRAINT "t_catalog_service_resources_resource_type_id_fkey" FOREIGN KEY ("resource_type_id") REFERENCES "public"."m_catalog_resource_types"("id");



ALTER TABLE ONLY "public"."t_catalog_service_resources"
    ADD CONSTRAINT "t_catalog_service_resources_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."t_catalog_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_catalog_service_resources"
    ADD CONSTRAINT "t_catalog_service_resources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_category_details"
    ADD CONSTRAINT "t_category_details_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."t_category_master"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_category_details"
    ADD CONSTRAINT "t_category_details_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_category_master"
    ADD CONSTRAINT "t_category_master_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_contact_addresses"
    ADD CONSTRAINT "t_contact_addresses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."t_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_contact_channels"
    ADD CONSTRAINT "t_contact_channels_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."t_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_contacts"
    ADD CONSTRAINT "t_contacts_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_contacts"
    ADD CONSTRAINT "t_contacts_parent_contact_id_fkey" FOREIGN KEY ("parent_contact_id") REFERENCES "public"."t_contacts"("id");



ALTER TABLE ONLY "public"."t_integration_providers"
    ADD CONSTRAINT "t_integration_providers_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "public"."t_integration_types"("id");



ALTER TABLE ONLY "public"."t_invitation_audit_log"
    ADD CONSTRAINT "t_invitation_audit_log_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."t_user_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_invitation_audit_log"
    ADD CONSTRAINT "t_invitation_audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_onboarding_step_status"
    ADD CONSTRAINT "t_onboarding_step_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_role_permissions"
    ADD CONSTRAINT "t_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."m_permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_role_permissions"
    ADD CONSTRAINT "t_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."t_category_details"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_role_permissions"
    ADD CONSTRAINT "t_role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_tax_info"
    ADD CONSTRAINT "t_tax_info_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_tax_settings"
    ADD CONSTRAINT "t_tax_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_tenant_domains"
    ADD CONSTRAINT "t_tenant_domains_domain_mapping_id_fkey" FOREIGN KEY ("domain_mapping_id") REFERENCES "public"."t_domain_mappings"("id");



ALTER TABLE ONLY "public"."t_tenant_domains"
    ADD CONSTRAINT "t_tenant_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_tenant_files"
    ADD CONSTRAINT "t_tenant_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_tenant_files"
    ADD CONSTRAINT "t_tenant_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_tenant_integrations"
    ADD CONSTRAINT "t_tenant_integrations_master_integration_id_fkey" FOREIGN KEY ("master_integration_id") REFERENCES "public"."t_integration_providers"("id");



ALTER TABLE ONLY "public"."t_tenant_onboarding"
    ADD CONSTRAINT "t_tenant_onboarding_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_tenant_profiles"
    ADD CONSTRAINT "t_tenant_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id");



ALTER TABLE ONLY "public"."t_tenant_regions"
    ADD CONSTRAINT "t_tenant_regions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_tenants"
    ADD CONSTRAINT "t_tenants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_user_auth_methods"
    ADD CONSTRAINT "t_user_auth_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_user_invitations"
    ADD CONSTRAINT "t_user_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_user_invitations"
    ADD CONSTRAINT "t_user_invitations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_user_invitations"
    ADD CONSTRAINT "t_user_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_user_invitations"
    ADD CONSTRAINT "t_user_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_user_invitations"
    ADD CONSTRAINT "t_user_invitations_last_resent_by_fkey" FOREIGN KEY ("last_resent_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."t_user_invitations"
    ADD CONSTRAINT "t_user_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_user_profiles"
    ADD CONSTRAINT "t_user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_user_tenant_roles"
    ADD CONSTRAINT "t_user_tenant_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."t_category_details"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_user_tenant_roles"
    ADD CONSTRAINT "t_user_tenant_roles_user_tenant_id_fkey" FOREIGN KEY ("user_tenant_id") REFERENCES "public"."t_user_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_user_tenants"
    ADD CONSTRAINT "t_user_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."t_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."t_user_tenants"
    ADD CONSTRAINT "t_user_tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow read access to block categories for authenticated users" ON "public"."m_block_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow read access to block masters for authenticated users" ON "public"."m_block_masters" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow read access to block variants for authenticated users" ON "public"."m_block_variants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow service role to manage block categories" ON "public"."m_block_categories" TO "service_role" USING (true);



CREATE POLICY "Allow service role to manage block masters" ON "public"."m_block_masters" TO "service_role" USING (true);



CREATE POLICY "Allow service role to manage block variants" ON "public"."m_block_variants" TO "service_role" USING (true);



CREATE POLICY "Authorized users can create invitations" ON "public"."t_user_invitations" FOR INSERT WITH CHECK ((("tenant_id" IN ( SELECT "ut"."tenant_id"
   FROM (("public"."t_user_tenants" "ut"
     JOIN "public"."t_user_tenant_roles" "utr" ON (("ut"."id" = "utr"."user_tenant_id")))
     JOIN "public"."t_category_details" "cd" ON (("utr"."role_id" = "cd"."id")))
  WHERE (("ut"."user_id" = "auth"."uid"()) AND (("ut"."status")::"text" = 'active'::"text") AND (("cd"."sub_cat_name")::"text" = ANY ((ARRAY['Owner'::character varying, 'Admin'::character varying, 'HR Manager'::character varying])::"text"[]))))) AND ("invited_by" = "auth"."uid"()) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Enable insert for anonymous users" ON "public"."leads" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Enable read for authenticated users" ON "public"."leads" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public can validate invitations" ON "public"."t_user_invitations" FOR SELECT USING ((("user_code" IS NOT NULL) AND ("secret_code" IS NOT NULL)));



CREATE POLICY "Service role can insert audit logs" ON "public"."t_invitation_audit_log" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage auth methods" ON "public"."t_user_auth_methods" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role full access to tenant domains" ON "public"."t_tenant_domains" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to tenant regions" ON "public"."t_tenant_regions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role only for domain mappings" ON "public"."t_domain_mappings" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can access contact addresses from their tenant" ON "public"."t_contact_addresses" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."t_contacts"
  WHERE (("t_contacts"."id" = "t_contact_addresses"."contact_id") AND ("t_contacts"."tenant_id" IN ( SELECT "t_contacts"."tenant_id"
           FROM "public"."t_user_profiles"
          WHERE ("t_user_profiles"."user_id" = "auth"."uid"())
        UNION
         SELECT "t_user_tenants"."tenant_id"
           FROM "public"."t_user_tenants"
          WHERE ("t_user_tenants"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can access contact channels from their tenant" ON "public"."t_contact_channels" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."t_contacts"
  WHERE (("t_contacts"."id" = "t_contact_channels"."contact_id") AND ("t_contacts"."tenant_id" IN ( SELECT "t_contacts"."tenant_id"
           FROM "public"."t_user_profiles"
          WHERE ("t_user_profiles"."user_id" = "auth"."uid"())
        UNION
         SELECT "t_user_tenants"."tenant_id"
           FROM "public"."t_user_tenants"
          WHERE ("t_user_tenants"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can access contacts from their tenant" ON "public"."t_contacts" TO "authenticated" USING ((("tenant_id" = ( SELECT "t_contacts"."tenant_id"
   FROM "public"."t_user_profiles"
  WHERE ("t_user_profiles"."user_id" = "auth"."uid"()))) OR ("tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
   FROM "public"."t_user_tenants"
  WHERE ("t_user_tenants"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own auth methods" ON "public"."t_user_auth_methods" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their invitations" ON "public"."t_user_invitations" FOR UPDATE USING ((("invited_by" = "auth"."uid"()) OR ("tenant_id" IN ( SELECT "ut"."tenant_id"
   FROM (("public"."t_user_tenants" "ut"
     JOIN "public"."t_user_tenant_roles" "utr" ON (("ut"."id" = "utr"."user_tenant_id")))
     JOIN "public"."t_category_details" "cd" ON (("utr"."role_id" = "cd"."id")))
  WHERE (("ut"."user_id" = "auth"."uid"()) AND (("ut"."status")::"text" = 'active'::"text") AND (("cd"."sub_cat_name")::"text" = ANY ((ARRAY['Owner'::character varying, 'Admin'::character varying])::"text"[])))))));



CREATE POLICY "Users can view audit logs" ON "public"."t_invitation_audit_log" FOR SELECT USING (("invitation_id" IN ( SELECT "t_user_invitations"."id"
   FROM "public"."t_user_invitations"
  WHERE ("t_user_invitations"."tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
           FROM "public"."t_user_tenants"
          WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))))));



CREATE POLICY "Users can view own auth methods" ON "public"."t_user_auth_methods" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view tenant invitations" ON "public"."t_user_invitations" FOR SELECT USING (("tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))));



CREATE POLICY "Users can view their tenant domains" ON "public"."t_tenant_domains" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "t_tenant_domains"."tenant_id") AND ("ut"."user_id" = "auth"."uid"()) AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "Users can view their tenant regions" ON "public"."t_tenant_regions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "t_tenant_regions"."tenant_id") AND ("ut"."user_id" = "auth"."uid"()) AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "authenticated_view_active_versions" ON "public"."t_bm_plan_version" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."t_bm_pricing_plan"
  WHERE (("t_bm_pricing_plan"."plan_id" = "t_bm_plan_version"."plan_id") AND ("t_bm_pricing_plan"."is_visible" = true) AND ("t_bm_pricing_plan"."is_archived" = false)))));



CREATE POLICY "authenticated_view_feature_reference" ON "public"."t_bm_feature_reference" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_view_notification_reference" ON "public"."t_bm_notification_reference" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_view_visible_plans" ON "public"."t_bm_pricing_plan" FOR SELECT TO "authenticated" USING ((("is_visible" = true) AND ("is_archived" = false)));



ALTER TABLE "public"."c_category_details" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "c_category_details_no_access" ON "public"."c_category_details" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."c_category_master" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "c_category_master_no_access" ON "public"."c_category_master" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "category_details_delete_policy" ON "public"."t_category_details" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"]) AND ("is_deletable" = true)));



CREATE POLICY "category_details_insert_policy" ON "public"."t_category_details" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "category_details_tenant_isolation" ON "public"."t_category_details" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id")));



CREATE POLICY "category_details_update_policy" ON "public"."t_category_details" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "category_master_delete_policy" ON "public"."t_category_master" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "category_master_insert_policy" ON "public"."t_category_master" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "category_master_tenant_isolation" ON "public"."t_category_master" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id")));



CREATE POLICY "category_master_update_policy" ON "public"."t_category_master" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "category_resources_master_policy" ON "public"."t_category_resources_master" TO "authenticated" USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "integration_providers_select_policy" ON "public"."t_integration_providers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "integration_types_select_policy" ON "public"."t_integration_types" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."m_block_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m_block_masters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m_block_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_no_modifications" ON "public"."m_permissions" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "permissions_tenant_isolation" ON "public"."m_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "role_permissions_delete_policy" ON "public"."t_role_permissions" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "role_permissions_insert_policy" ON "public"."t_role_permissions" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "role_permissions_tenant_isolation" ON "public"."t_role_permissions" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id")));



CREATE POLICY "role_permissions_update_policy" ON "public"."t_role_permissions" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "service_role_access_t_catalog_items" ON "public"."t_catalog_items" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_access_t_catalog_resource_pricing" ON "public"."t_catalog_resource_pricing" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_access_t_catalog_resources" ON "public"."t_catalog_resources" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_access_t_catalog_service_resources" ON "public"."t_catalog_service_resources" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_bypass_rls_tax_settings" ON "public"."t_tax_settings" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_tax_settings" ON "public"."t_tax_settings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_manage_feature_reference" ON "public"."t_bm_feature_reference" TO "service_role" USING (true);



CREATE POLICY "service_role_manage_invoices" ON "public"."t_bm_invoice" TO "service_role" USING (true);



CREATE POLICY "service_role_manage_notification_reference" ON "public"."t_bm_notification_reference" TO "service_role" USING (true);



CREATE POLICY "service_role_manage_plans" ON "public"."t_bm_pricing_plan" TO "service_role" USING (true);



CREATE POLICY "service_role_manage_subscriptions" ON "public"."t_bm_tenant_subscription" TO "service_role" USING (true);



CREATE POLICY "service_role_manage_usage" ON "public"."t_bm_subscription_usage" TO "service_role" USING (true);



CREATE POLICY "service_role_manage_versions" ON "public"."t_bm_plan_version" TO "service_role" USING (true);



CREATE POLICY "step_status_insert" ON "public"."t_onboarding_step_status" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))));



CREATE POLICY "step_status_select" ON "public"."t_onboarding_step_status" FOR SELECT USING (("tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))));



CREATE POLICY "step_status_update" ON "public"."t_onboarding_step_status" FOR UPDATE USING (("tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))));



CREATE POLICY "super_admin_audit_logs_select" ON "public"."t_audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_profiles" "up"
  WHERE (("up"."user_id" = "auth"."uid"()) AND ("up"."is_admin" = true)))));



CREATE POLICY "superadmin_bypass" ON "public"."t_user_profiles" USING ((("auth"."jwt"() ->> 'role'::"text") = 'supabase_admin'::"text"));



ALTER TABLE "public"."t_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_bm_feature_reference" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_bm_invoice" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_bm_notification_reference" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_bm_plan_version" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_bm_pricing_plan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_bm_subscription_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_bm_tenant_subscription" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_catalog_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_catalog_resource_pricing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_catalog_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_catalog_service_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_category_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_category_master" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_contact_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_contact_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_domain_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_integration_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_integration_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_invitation_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_onboarding_step_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tax_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tax_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tax_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tenant_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tenant_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tenant_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tenant_onboarding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tenant_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tenant_regions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_user_auth_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_user_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_user_tenant_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."t_user_tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_info_delete_policy" ON "public"."t_tax_info" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "tax_info_insert_policy" ON "public"."t_tax_info" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "tax_info_tenant_isolation" ON "public"."t_tax_info" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id")));



CREATE POLICY "tax_info_update_policy" ON "public"."t_tax_info" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "tax_rates_policy" ON "public"."t_tax_rates" TO "authenticated" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "tax_settings_all_for_super_admins" ON "public"."t_tax_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_profiles" "up"
  WHERE (("up"."user_id" = "auth"."uid"()) AND ("up"."is_admin" = true)))));



CREATE POLICY "tax_settings_insert_for_tenant_admins" ON "public"."t_tax_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."user_id" = "auth"."uid"()) AND ("ut"."tenant_id" = "t_tax_settings"."tenant_id") AND ("ut"."is_admin" = true) AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tax_settings_select_for_super_admins" ON "public"."t_tax_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_profiles" "up"
  WHERE (("up"."user_id" = "auth"."uid"()) AND ("up"."is_admin" = true)))));



CREATE POLICY "tax_settings_select_for_tenant_users" ON "public"."t_tax_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."user_id" = "auth"."uid"()) AND ("ut"."tenant_id" = "t_tax_settings"."tenant_id") AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tax_settings_update_for_tenant_admins" ON "public"."t_tax_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."user_id" = "auth"."uid"()) AND ("ut"."tenant_id" = "t_tax_settings"."tenant_id") AND ("ut"."is_admin" = true) AND (("ut"."status")::"text" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."user_id" = "auth"."uid"()) AND ("ut"."tenant_id" = "t_tax_settings"."tenant_id") AND ("ut"."is_admin" = true) AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tenant_admin_audit_logs_select" ON "public"."t_audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."user_id" = "auth"."uid"()) AND ("ut"."tenant_id" = "t_audit_logs"."tenant_id") AND ("ut"."is_admin" = true) AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tenant_creation_during_signup" ON "public"."t_tenants" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "tenant_files_delete_policy" ON "public"."t_tenant_files" FOR DELETE USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "tenant_files_insert_policy" ON "public"."t_tenant_files" FOR INSERT WITH CHECK ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id")));



CREATE POLICY "tenant_files_select_policy" ON "public"."t_tenant_files" FOR SELECT USING ("public"."has_tenant_access"("tenant_id"));



CREATE POLICY "tenant_files_update_policy" ON "public"."t_tenant_files" FOR UPDATE USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "tenant_integrations_delete_policy" ON "public"."t_tenant_integrations" FOR DELETE USING (("tenant_id" = ("public"."get_current_tenant_id"())::"text"));



CREATE POLICY "tenant_integrations_insert_policy" ON "public"."t_tenant_integrations" FOR INSERT WITH CHECK (("tenant_id" = ("public"."get_current_tenant_id"())::"text"));



CREATE POLICY "tenant_integrations_select_policy" ON "public"."t_tenant_integrations" FOR SELECT USING (("tenant_id" = ("public"."get_current_tenant_id"())::"text"));



CREATE POLICY "tenant_integrations_update_policy" ON "public"."t_tenant_integrations" FOR UPDATE USING (("tenant_id" = ("public"."get_current_tenant_id"())::"text"));



CREATE POLICY "tenant_isolation" ON "public"."t_category_resources_master" USING (("tenant_id" = ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_isolation_t_catalog_items" ON "public"."t_catalog_items" TO "authenticated" USING (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_isolation_t_catalog_resource_pricing" ON "public"."t_catalog_resource_pricing" TO "authenticated" USING (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_isolation_t_catalog_resources" ON "public"."t_catalog_resources" TO "authenticated" USING (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_isolation_t_catalog_service_resources" ON "public"."t_catalog_service_resources" TO "authenticated" USING (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "tenant_onboarding_insert" ON "public"."t_tenant_onboarding" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tenant_onboarding_select" ON "public"."t_tenant_onboarding" FOR SELECT USING (("tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tenant_onboarding_update" ON "public"."t_tenant_onboarding" FOR UPDATE USING (("tenant_id" IN ( SELECT "t_user_tenants"."tenant_id"
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tenant_profiles_delete_policy" ON "public"."t_tenant_profiles" FOR DELETE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "tenant_profiles_insert_policy" ON "public"."t_tenant_profiles" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "tenant_profiles_tenant_isolation" ON "public"."t_tenant_profiles" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id")));



CREATE POLICY "tenant_profiles_update_policy" ON "public"."t_tenant_profiles" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])));



CREATE POLICY "tenant_tax_rates_delete" ON "public"."t_tax_rates" FOR DELETE USING ((("tenant_id")::"text" = (("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text")));



CREATE POLICY "tenant_tax_rates_insert" ON "public"."t_tax_rates" FOR INSERT WITH CHECK ((("tenant_id")::"text" = (("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text")));



CREATE POLICY "tenant_tax_rates_select" ON "public"."t_tax_rates" FOR SELECT USING ((("tenant_id")::"text" = (("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text")));



CREATE POLICY "tenant_tax_rates_update" ON "public"."t_tax_rates" FOR UPDATE USING ((("tenant_id")::"text" = (("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text"))) WITH CHECK ((("tenant_id")::"text" = (("current_setting"('request.jwt.claims'::"text", true))::"json" ->> 'tenant_id'::"text")));



CREATE POLICY "tenant_view_own_invoices" ON "public"."t_bm_invoice" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."t_bm_tenant_subscription" "ts"
     JOIN "public"."t_user_tenants" "ut" ON (("ut"."tenant_id" = "ts"."tenant_id")))
  WHERE (("ts"."subscription_id" = "t_bm_invoice"."subscription_id") AND ("ut"."user_id" = "auth"."uid"()) AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tenant_view_own_subscriptions" ON "public"."t_bm_tenant_subscription" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."tenant_id" = "t_bm_tenant_subscription"."tenant_id") AND ("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tenant_view_own_usage" ON "public"."t_bm_subscription_usage" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."t_bm_tenant_subscription" "ts"
     JOIN "public"."t_user_tenants" "ut" ON (("ut"."tenant_id" = "ts"."tenant_id")))
  WHERE (("ts"."subscription_id" = "t_bm_subscription_usage"."subscription_id") AND ("ut"."user_id" = "auth"."uid"()) AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "tenants_insert_policy" ON "public"."t_tenants" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "tenants_tenant_isolation" ON "public"."t_tenants" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."tenant_id" = "t_tenants"."id") AND ("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text")))) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "tenants_update_policy" ON "public"."t_tenants" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR ("is_admin" = true) OR (EXISTS ( SELECT 1
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."tenant_id" = "t_tenants"."id") AND ("t_user_tenants"."user_id" = "auth"."uid"()) AND (("t_user_tenants"."status")::"text" = 'active'::"text"))))));



CREATE POLICY "user_profiles_delete_policy" ON "public"."t_user_profiles" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "ut"."user_id"
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("ut"."tenant_id") AND "public"."has_tenant_role"("ut"."tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"]))))));



CREATE POLICY "user_profiles_insert_policy" ON "public"."t_user_profiles" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "public"."get_current_tenant_id"()) AND ("ut"."user_id" = "auth"."uid"()) AND "public"."has_tenant_role"("ut"."tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"]))))));



CREATE POLICY "user_profiles_tenant_isolation" ON "public"."t_user_profiles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "ut"."user_id"
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("ut"."tenant_id"))))));



CREATE POLICY "user_profiles_update_policy" ON "public"."t_user_profiles" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "ut"."user_id"
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("ut"."tenant_id") AND "public"."has_tenant_role"("ut"."tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"]))))));



CREATE POLICY "user_tenant_audit_logs_select" ON "public"."t_audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."user_id" = "auth"."uid"()) AND ("ut"."tenant_id" = "t_audit_logs"."tenant_id") AND (("ut"."status")::"text" = 'active'::"text")))));



CREATE POLICY "user_tenant_roles_delete_policy" ON "public"."t_user_tenant_roles" FOR DELETE TO "authenticated" USING (("user_tenant_id" IN ( SELECT "ut"."id"
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("ut"."tenant_id") AND "public"."has_tenant_role"("ut"."tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])))));



CREATE POLICY "user_tenant_roles_insert_policy" ON "public"."t_user_tenant_roles" FOR INSERT TO "authenticated" WITH CHECK (("user_tenant_id" IN ( SELECT "ut"."id"
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("ut"."tenant_id") AND "public"."has_tenant_role"("ut"."tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])))));



CREATE POLICY "user_tenant_roles_tenant_isolation" ON "public"."t_user_tenant_roles" FOR SELECT TO "authenticated" USING (("user_tenant_id" IN ( SELECT "t_user_tenants"."id"
   FROM "public"."t_user_tenants"
  WHERE (("t_user_tenants"."user_id" = "auth"."uid"()) OR (("t_user_tenants"."tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("t_user_tenants"."tenant_id"))))));



CREATE POLICY "user_tenant_roles_update_policy" ON "public"."t_user_tenant_roles" FOR UPDATE TO "authenticated" USING (("user_tenant_id" IN ( SELECT "ut"."id"
   FROM "public"."t_user_tenants" "ut"
  WHERE (("ut"."tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("ut"."tenant_id") AND "public"."has_tenant_role"("ut"."tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])))));



CREATE POLICY "user_tenants_delete_policy" ON "public"."t_user_tenants" FOR DELETE TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND ("tenant_id" = "public"."get_current_tenant_id"())) OR (("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"]))));



CREATE POLICY "user_tenants_insert_policy" ON "public"."t_user_tenants" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR ((("user_id" = "auth"."uid"()) AND ("tenant_id" = "public"."get_current_tenant_id"())) OR (("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"])))));



CREATE POLICY "user_tenants_tenant_isolation" ON "public"."t_user_tenants" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id"))));



CREATE POLICY "user_tenants_update_policy" ON "public"."t_user_tenants" FOR UPDATE TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND ("tenant_id" = "public"."get_current_tenant_id"())) OR (("tenant_id" = "public"."get_current_tenant_id"()) AND "public"."has_tenant_access"("tenant_id") AND "public"."has_tenant_role"("tenant_id", ARRAY['Owner'::"text", 'Admin'::"text"]))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."t_user_invitations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."t_user_profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."t_user_tenants";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."add_contact_classification"("contact_id" "uuid", "classification" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_contact_classification"("contact_id" "uuid", "classification" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_contact_classification"("contact_id" "uuid", "classification" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_contact_tag"("contact_id" "uuid", "tag_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."add_contact_tag"("contact_id" "uuid", "tag_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_contact_tag"("contact_id" "uuid", "tag_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."associate_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_resource_data" "jsonb", "p_idempotency_key" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."associate_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_resource_data" "jsonb", "p_idempotency_key" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."associate_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_resource_data" "jsonb", "p_idempotency_key" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_create_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_services_data" "jsonb", "p_idempotency_key" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_create_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_services_data" "jsonb", "p_idempotency_key" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_create_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_services_data" "jsonb", "p_idempotency_key" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_update_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_updates_data" "jsonb", "p_idempotency_key" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_update_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_updates_data" "jsonb", "p_idempotency_key" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_update_services"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_updates_data" "jsonb", "p_idempotency_key" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid", "p_is_live" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid", "p_is_live" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid", "p_is_live" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid", "p_is_live" boolean, "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid", "p_is_live" boolean, "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_contact_duplicates"("p_contact_channels" "jsonb", "p_exclude_contact_id" "uuid", "p_is_live" boolean, "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_invitation_expiry"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_invitation_expiry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_invitation_expiry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_invitations"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_invitations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_invitations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."copy_catalog_live_to_test"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."copy_catalog_live_to_test"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."copy_catalog_live_to_test"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_catalog_item_version"("p_current_item_id" "uuid", "p_version_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_catalog_item_version"("p_current_item_id" "uuid", "p_version_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_catalog_item_version"("p_current_item_id" "uuid", "p_version_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_contact_transaction"("p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_contact_transaction"("p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_contact_transaction"("p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_service_catalog_item"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_service_data" "jsonb", "p_idempotency_key" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."create_service_catalog_item"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_service_data" "jsonb", "p_idempotency_key" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_service_catalog_item"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_service_data" "jsonb", "p_idempotency_key" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean, "p_is_live" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean, "p_is_live" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean, "p_is_live" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean, "p_is_live" boolean, "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean, "p_is_live" boolean, "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_contact_transaction"("p_contact_id" "uuid", "p_force" boolean, "p_is_live" boolean, "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_idempotency_key" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_idempotency_key" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_idempotency_key" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_default_tax_rate"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_default_tax_rate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_default_tax_rate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_primary_auth_method"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_primary_auth_method"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_primary_auth_method"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_master_categories"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_master_categories"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_master_categories"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_resources"("p_tenant_id" "uuid", "p_is_live" boolean, "p_resource_type" character varying, "p_filters" "jsonb", "p_page" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_resources"("p_tenant_id" "uuid", "p_is_live" boolean, "p_resource_type" character varying, "p_filters" "jsonb", "p_page" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_resources"("p_tenant_id" "uuid", "p_is_live" boolean, "p_resource_type" character varying, "p_filters" "jsonb", "p_page" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_catalog_item_history"("p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_catalog_item_history"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_catalog_item_history"("p_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean, "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean, "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_contact_with_relationships"("p_contact_id" "uuid", "p_is_live" boolean, "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_tax_rate_sequence"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_tax_rate_sequence"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_tax_rate_sequence"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_original_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_original_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_original_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_product_master_data"("p_category_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_master_data"("p_category_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_master_data"("p_category_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean, "p_currency_code" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean, "p_currency_code" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean, "p_currency_code" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_resources"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_is_live" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_catalog_versioning"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_catalog_versioning"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_catalog_versioning"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_tenant_access"("check_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tenant_access"("check_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tenant_access"("check_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_tenant_role"("check_tenant_id" "uuid", "role_names" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_tenant_role"("check_tenant_id" "uuid", "role_names" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tenant_role"("check_tenant_id" "uuid", "role_names" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_tenant_onboarding"() TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_tenant_onboarding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_tenant_onboarding"() TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_audit_logs_batch"("logs" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_audit_logs_batch"("logs" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_audit_logs_batch"("logs" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tenant_admin"("check_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tenant_admin"("check_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_admin"("check_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."promote_catalog_test_to_live"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."promote_catalog_test_to_live"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_catalog_test_to_live"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."query_service_catalog_items"("p_tenant_id" "uuid", "p_is_live" boolean, "p_filters" "jsonb", "p_page" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."query_service_catalog_items"("p_tenant_id" "uuid", "p_is_live" boolean, "p_filters" "jsonb", "p_page" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."query_service_catalog_items"("p_tenant_id" "uuid", "p_is_live" boolean, "p_filters" "jsonb", "p_page" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_contact_classification"("contact_id" "uuid", "classification" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_contact_classification"("contact_id" "uuid", "classification" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_contact_classification"("contact_id" "uuid", "classification" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_contact_tag"("contact_id" "uuid", "tag_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_contact_tag"("contact_id" "uuid", "tag_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_contact_tag"("contact_id" "uuid", "tag_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_tax_rate_sequences"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_tax_rate_sequences"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_tax_rate_sequences"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."soft_delete_catalog_item"("p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."soft_delete_catalog_item"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_catalog_item"("p_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_catalog_timestamp_and_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_catalog_timestamp_and_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_catalog_timestamp_and_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_contact_transaction"("p_contact_id" "uuid", "p_contact_data" "jsonb", "p_contact_channels" "jsonb", "p_addresses" "jsonb", "p_contact_persons" "jsonb", "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_duplicate_flags"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_duplicate_flags"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_duplicate_flags"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_master_catalog_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_master_catalog_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_master_catalog_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_update_data" "jsonb", "p_idempotency_key" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."update_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_update_data" "jsonb", "p_idempotency_key" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_service_catalog_item"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_update_data" "jsonb", "p_idempotency_key" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_pricing_data" "jsonb", "p_idempotency_key" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."update_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_pricing_data" "jsonb", "p_idempotency_key" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_service_pricing"("p_service_id" "uuid", "p_tenant_id" "uuid", "p_user_id" "uuid", "p_is_live" boolean, "p_pricing_data" "jsonb", "p_idempotency_key" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_environment"("p_tenant_id" "uuid", "p_is_live" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_environment"("p_tenant_id" "uuid", "p_is_live" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_environment"("p_tenant_id" "uuid", "p_is_live" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_category_environment_consistency"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_category_environment_consistency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_category_environment_consistency"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_item_environment_consistency"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_item_environment_consistency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_item_environment_consistency"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_pricing_template_config"("p_rule_type" character varying, "p_condition_config" "jsonb", "p_action_config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_pricing_template_config"("p_rule_type" character varying, "p_condition_config" "jsonb", "p_action_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_pricing_template_config"("p_rule_type" character varying, "p_condition_config" "jsonb", "p_action_config" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_tax_rate_business_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_tax_rate_business_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_tax_rate_business_rules"() TO "service_role";




















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON TABLE "public"."c_category_details" TO "anon";
GRANT ALL ON TABLE "public"."c_category_details" TO "authenticated";
GRANT ALL ON TABLE "public"."c_category_details" TO "service_role";



GRANT ALL ON TABLE "public"."c_category_master" TO "anon";
GRANT ALL ON TABLE "public"."c_category_master" TO "authenticated";
GRANT ALL ON TABLE "public"."c_category_master" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."m_block_categories" TO "anon";
GRANT ALL ON TABLE "public"."m_block_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."m_block_categories" TO "service_role";



GRANT ALL ON TABLE "public"."m_block_masters" TO "anon";
GRANT ALL ON TABLE "public"."m_block_masters" TO "authenticated";
GRANT ALL ON TABLE "public"."m_block_masters" TO "service_role";



GRANT ALL ON TABLE "public"."m_block_variants" TO "anon";
GRANT ALL ON TABLE "public"."m_block_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."m_block_variants" TO "service_role";



GRANT ALL ON TABLE "public"."m_catalog_categories" TO "anon";
GRANT ALL ON TABLE "public"."m_catalog_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."m_catalog_categories" TO "service_role";



GRANT ALL ON TABLE "public"."m_catalog_category_industry_map" TO "anon";
GRANT ALL ON TABLE "public"."m_catalog_category_industry_map" TO "authenticated";
GRANT ALL ON TABLE "public"."m_catalog_category_industry_map" TO "service_role";



GRANT ALL ON TABLE "public"."m_catalog_industries" TO "anon";
GRANT ALL ON TABLE "public"."m_catalog_industries" TO "authenticated";
GRANT ALL ON TABLE "public"."m_catalog_industries" TO "service_role";



GRANT ALL ON TABLE "public"."m_catalog_pricing_templates" TO "anon";
GRANT ALL ON TABLE "public"."m_catalog_pricing_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."m_catalog_pricing_templates" TO "service_role";



GRANT ALL ON TABLE "public"."m_catalog_resource_templates" TO "anon";
GRANT ALL ON TABLE "public"."m_catalog_resource_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."m_catalog_resource_templates" TO "service_role";



GRANT ALL ON TABLE "public"."m_catalog_resource_types" TO "anon";
GRANT ALL ON TABLE "public"."m_catalog_resource_types" TO "authenticated";
GRANT ALL ON TABLE "public"."m_catalog_resource_types" TO "service_role";



GRANT ALL ON TABLE "public"."m_category_details" TO "anon";
GRANT ALL ON TABLE "public"."m_category_details" TO "authenticated";
GRANT ALL ON TABLE "public"."m_category_details" TO "service_role";



GRANT ALL ON TABLE "public"."m_category_master" TO "anon";
GRANT ALL ON TABLE "public"."m_category_master" TO "authenticated";
GRANT ALL ON TABLE "public"."m_category_master" TO "service_role";



GRANT ALL ON TABLE "public"."m_permissions" TO "anon";
GRANT ALL ON TABLE "public"."m_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."m_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."n_customers" TO "anon";
GRANT ALL ON TABLE "public"."n_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."n_customers" TO "service_role";



GRANT ALL ON TABLE "public"."n_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."n_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."n_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."n_events" TO "anon";
GRANT ALL ON TABLE "public"."n_events" TO "authenticated";
GRANT ALL ON TABLE "public"."n_events" TO "service_role";



GRANT ALL ON TABLE "public"."n_platform_providers" TO "anon";
GRANT ALL ON TABLE "public"."n_platform_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."n_platform_providers" TO "service_role";



GRANT ALL ON TABLE "public"."n_templates" TO "anon";
GRANT ALL ON TABLE "public"."n_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."n_templates" TO "service_role";



GRANT ALL ON TABLE "public"."n_tenant_preferences" TO "anon";
GRANT ALL ON TABLE "public"."n_tenant_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."n_tenant_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."t_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."t_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."t_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."t_bm_feature_reference" TO "anon";
GRANT ALL ON TABLE "public"."t_bm_feature_reference" TO "authenticated";
GRANT ALL ON TABLE "public"."t_bm_feature_reference" TO "service_role";



GRANT ALL ON TABLE "public"."t_bm_invoice" TO "anon";
GRANT ALL ON TABLE "public"."t_bm_invoice" TO "authenticated";
GRANT ALL ON TABLE "public"."t_bm_invoice" TO "service_role";



GRANT ALL ON TABLE "public"."t_bm_notification_reference" TO "anon";
GRANT ALL ON TABLE "public"."t_bm_notification_reference" TO "authenticated";
GRANT ALL ON TABLE "public"."t_bm_notification_reference" TO "service_role";



GRANT ALL ON TABLE "public"."t_bm_plan_version" TO "anon";
GRANT ALL ON TABLE "public"."t_bm_plan_version" TO "authenticated";
GRANT ALL ON TABLE "public"."t_bm_plan_version" TO "service_role";



GRANT ALL ON TABLE "public"."t_bm_pricing_plan" TO "anon";
GRANT ALL ON TABLE "public"."t_bm_pricing_plan" TO "authenticated";
GRANT ALL ON TABLE "public"."t_bm_pricing_plan" TO "service_role";



GRANT ALL ON TABLE "public"."t_bm_subscription_usage" TO "anon";
GRANT ALL ON TABLE "public"."t_bm_subscription_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."t_bm_subscription_usage" TO "service_role";



GRANT ALL ON TABLE "public"."t_bm_tenant_subscription" TO "anon";
GRANT ALL ON TABLE "public"."t_bm_tenant_subscription" TO "authenticated";
GRANT ALL ON TABLE "public"."t_bm_tenant_subscription" TO "service_role";



GRANT ALL ON TABLE "public"."t_catalog_categories" TO "anon";
GRANT ALL ON TABLE "public"."t_catalog_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."t_catalog_categories" TO "service_role";



GRANT ALL ON TABLE "public"."t_catalog_industries" TO "anon";
GRANT ALL ON TABLE "public"."t_catalog_industries" TO "authenticated";
GRANT ALL ON TABLE "public"."t_catalog_industries" TO "service_role";



GRANT ALL ON TABLE "public"."t_catalog_items" TO "anon";
GRANT ALL ON TABLE "public"."t_catalog_items" TO "authenticated";
GRANT ALL ON TABLE "public"."t_catalog_items" TO "service_role";



GRANT ALL ON TABLE "public"."t_catalog_resource_pricing" TO "anon";
GRANT ALL ON TABLE "public"."t_catalog_resource_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."t_catalog_resource_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."t_catalog_resources" TO "anon";
GRANT ALL ON TABLE "public"."t_catalog_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."t_catalog_resources" TO "service_role";



GRANT ALL ON TABLE "public"."t_catalog_service_resources" TO "anon";
GRANT ALL ON TABLE "public"."t_catalog_service_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."t_catalog_service_resources" TO "service_role";



GRANT ALL ON TABLE "public"."t_category_details" TO "anon";
GRANT ALL ON TABLE "public"."t_category_details" TO "authenticated";
GRANT ALL ON TABLE "public"."t_category_details" TO "service_role";



GRANT ALL ON TABLE "public"."t_category_master" TO "anon";
GRANT ALL ON TABLE "public"."t_category_master" TO "authenticated";
GRANT ALL ON TABLE "public"."t_category_master" TO "service_role";



GRANT ALL ON TABLE "public"."t_category_resources_master" TO "anon";
GRANT ALL ON TABLE "public"."t_category_resources_master" TO "authenticated";
GRANT ALL ON TABLE "public"."t_category_resources_master" TO "service_role";



GRANT ALL ON TABLE "public"."t_contact_addresses" TO "anon";
GRANT ALL ON TABLE "public"."t_contact_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."t_contact_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."t_contact_channels" TO "anon";
GRANT ALL ON TABLE "public"."t_contact_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."t_contact_channels" TO "service_role";



GRANT ALL ON TABLE "public"."t_contacts" TO "anon";
GRANT ALL ON TABLE "public"."t_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."t_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."t_domain_mappings" TO "anon";
GRANT ALL ON TABLE "public"."t_domain_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."t_domain_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."t_idempotency_keys" TO "anon";
GRANT ALL ON TABLE "public"."t_idempotency_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."t_idempotency_keys" TO "service_role";



GRANT ALL ON TABLE "public"."t_integration_providers" TO "anon";
GRANT ALL ON TABLE "public"."t_integration_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."t_integration_providers" TO "service_role";



GRANT ALL ON TABLE "public"."t_integration_types" TO "anon";
GRANT ALL ON TABLE "public"."t_integration_types" TO "authenticated";
GRANT ALL ON TABLE "public"."t_integration_types" TO "service_role";



GRANT ALL ON TABLE "public"."t_invitation_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."t_invitation_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."t_invitation_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."t_onboarding_step_status" TO "anon";
GRANT ALL ON TABLE "public"."t_onboarding_step_status" TO "authenticated";
GRANT ALL ON TABLE "public"."t_onboarding_step_status" TO "service_role";



GRANT ALL ON TABLE "public"."t_role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."t_role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."t_role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."t_tax_info" TO "anon";
GRANT ALL ON TABLE "public"."t_tax_info" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tax_info" TO "service_role";



GRANT ALL ON TABLE "public"."t_tax_rates" TO "anon";
GRANT ALL ON TABLE "public"."t_tax_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tax_rates" TO "service_role";



GRANT ALL ON TABLE "public"."t_tax_settings" TO "anon";
GRANT ALL ON TABLE "public"."t_tax_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tax_settings" TO "service_role";



GRANT ALL ON TABLE "public"."t_tenant_domains" TO "anon";
GRANT ALL ON TABLE "public"."t_tenant_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tenant_domains" TO "service_role";



GRANT ALL ON TABLE "public"."t_tenant_files" TO "anon";
GRANT ALL ON TABLE "public"."t_tenant_files" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tenant_files" TO "service_role";



GRANT ALL ON TABLE "public"."t_tenant_integrations" TO "anon";
GRANT ALL ON TABLE "public"."t_tenant_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tenant_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."t_tenant_onboarding" TO "anon";
GRANT ALL ON TABLE "public"."t_tenant_onboarding" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tenant_onboarding" TO "service_role";



GRANT ALL ON TABLE "public"."t_tenant_profiles" TO "anon";
GRANT ALL ON TABLE "public"."t_tenant_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tenant_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."t_tenant_regions" TO "anon";
GRANT ALL ON TABLE "public"."t_tenant_regions" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tenant_regions" TO "service_role";



GRANT ALL ON TABLE "public"."t_tenants" TO "anon";
GRANT ALL ON TABLE "public"."t_tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."t_tenants" TO "service_role";



GRANT ALL ON TABLE "public"."t_user_auth_methods" TO "anon";
GRANT ALL ON TABLE "public"."t_user_auth_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."t_user_auth_methods" TO "service_role";



GRANT UPDATE("last_used_at") ON TABLE "public"."t_user_auth_methods" TO "authenticated";



GRANT UPDATE("metadata") ON TABLE "public"."t_user_auth_methods" TO "authenticated";



GRANT ALL ON TABLE "public"."t_user_invitations" TO "anon";
GRANT ALL ON TABLE "public"."t_user_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."t_user_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."t_user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."t_user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."t_user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."t_user_tenant_roles" TO "anon";
GRANT ALL ON TABLE "public"."t_user_tenant_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."t_user_tenant_roles" TO "service_role";



GRANT ALL ON TABLE "public"."t_user_tenants" TO "anon";
GRANT ALL ON TABLE "public"."t_user_tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."t_user_tenants" TO "service_role";



GRANT ALL ON TABLE "public"."v_audit_logs_detailed" TO "anon";
GRANT ALL ON TABLE "public"."v_audit_logs_detailed" TO "authenticated";
GRANT ALL ON TABLE "public"."v_audit_logs_detailed" TO "service_role";



GRANT ALL ON TABLE "public"."v_onboarding_master_data" TO "anon";
GRANT ALL ON TABLE "public"."v_onboarding_master_data" TO "authenticated";
GRANT ALL ON TABLE "public"."v_onboarding_master_data" TO "service_role";








































































































































































ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "n8n" GRANT ALL ON TABLES  TO "postgres";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
