// src/validators/clientAssetRegistryValidators.ts
// express-validator rules for Client Asset Registry endpoints

import { body, query, ValidationChain } from 'express-validator';

const VALID_STATUSES = ['active', 'inactive', 'under_repair', 'decommissioned'];
const VALID_CONDITIONS = ['good', 'fair', 'poor', 'critical'];
const VALID_CRITICALITIES = ['low', 'medium', 'high', 'critical'];

/**
 * POST /client-asset-registry — create asset
 */
export const createAssetValidation: ValidationChain[] = [
  body('owner_contact_id')
    .notEmpty().withMessage('owner_contact_id is required — every asset must belong to a client')
    .isUUID().withMessage('owner_contact_id must be a valid UUID'),

  body('resource_type_id')
    .notEmpty().withMessage('resource_type_id is required')
    .isString().withMessage('resource_type_id must be a string'),

  body('name')
    .notEmpty().withMessage('name is required')
    .isString().withMessage('name must be a string')
    .isLength({ max: 255 }).withMessage('name must be 255 characters or less'),

  body('asset_type_id')
    .optional()
    .isUUID().withMessage('asset_type_id must be a valid UUID'),

  body('parent_asset_id')
    .optional()
    .isUUID().withMessage('parent_asset_id must be a valid UUID'),

  body('template_id')
    .optional()
    .isUUID().withMessage('template_id must be a valid UUID'),

  body('industry_id')
    .optional()
    .isUUID().withMessage('industry_id must be a valid UUID'),

  body('code')
    .optional()
    .isString().withMessage('code must be a string')
    .isLength({ max: 100 }).withMessage('code must be 100 characters or less'),

  body('status')
    .optional()
    .isIn(VALID_STATUSES).withMessage(`status must be one of: ${VALID_STATUSES.join(', ')}`),

  body('condition')
    .optional()
    .isIn(VALID_CONDITIONS).withMessage(`condition must be one of: ${VALID_CONDITIONS.join(', ')}`),

  body('criticality')
    .optional()
    .isIn(VALID_CRITICALITIES).withMessage(`criticality must be one of: ${VALID_CRITICALITIES.join(', ')}`),

  body('serial_number')
    .optional()
    .isString().withMessage('serial_number must be a string'),

  body('purchase_date')
    .optional()
    .isISO8601().withMessage('purchase_date must be a valid date'),

  body('warranty_expiry')
    .optional()
    .isISO8601().withMessage('warranty_expiry must be a valid date'),

  body('area_sqft')
    .optional()
    .isFloat({ min: 0 }).withMessage('area_sqft must be a positive number'),

  body('capacity')
    .optional()
    .isInt({ min: 0 }).withMessage('capacity must be a non-negative integer'),

  body('specifications')
    .optional()
    .isObject().withMessage('specifications must be an object'),

  body('tags')
    .optional()
    .isArray().withMessage('tags must be an array'),

  body('is_live')
    .optional()
    .isBoolean().withMessage('is_live must be a boolean')
];

/**
 * PATCH /client-asset-registry?id=... — update asset
 */
export const updateAssetValidation: ValidationChain[] = [
  query('id')
    .notEmpty().withMessage('id query parameter is required')
    .isUUID().withMessage('id must be a valid UUID'),

  body('name')
    .optional()
    .isString().withMessage('name must be a string')
    .isLength({ min: 1, max: 255 }).withMessage('name must be 1-255 characters'),

  body('status')
    .optional()
    .isIn(VALID_STATUSES).withMessage(`status must be one of: ${VALID_STATUSES.join(', ')}`),

  body('condition')
    .optional()
    .isIn(VALID_CONDITIONS).withMessage(`condition must be one of: ${VALID_CONDITIONS.join(', ')}`),

  body('criticality')
    .optional()
    .isIn(VALID_CRITICALITIES).withMessage(`criticality must be one of: ${VALID_CRITICALITIES.join(', ')}`),

  body('owner_contact_id')
    .optional()
    .isUUID().withMessage('owner_contact_id must be a valid UUID'),

  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean')
];

/**
 * DELETE /client-asset-registry?id=... — soft-delete asset
 */
export const deleteAssetValidation: ValidationChain[] = [
  query('id')
    .notEmpty().withMessage('id query parameter is required')
    .isUUID().withMessage('id must be a valid UUID')
];

/**
 * POST /client-asset-registry/contract-assets — link assets to contract
 */
export const linkContractAssetsValidation: ValidationChain[] = [
  body('contract_id')
    .notEmpty().withMessage('contract_id is required')
    .isUUID().withMessage('contract_id must be a valid UUID'),

  body('assets')
    .notEmpty().withMessage('assets array is required')
    .isArray({ min: 1 }).withMessage('assets must be a non-empty array'),

  body('assets.*.asset_id')
    .notEmpty().withMessage('Each asset must have an asset_id')
    .isUUID().withMessage('asset_id must be a valid UUID'),

  body('assets.*.coverage_type')
    .optional()
    .isString().withMessage('coverage_type must be a string'),

  body('assets.*.service_terms')
    .optional()
    .isObject().withMessage('service_terms must be an object'),

  body('is_live')
    .optional()
    .isBoolean().withMessage('is_live must be a boolean')
];

/**
 * GET /client-asset-registry/contract-assets?contract_id=...
 */
export const getContractAssetsValidation: ValidationChain[] = [
  query('contract_id')
    .notEmpty().withMessage('contract_id is required')
    .isUUID().withMessage('contract_id must be a valid UUID')
];
