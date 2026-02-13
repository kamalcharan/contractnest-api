// src/routes/assetRegistryRoutes.ts
// Routes for the Asset Registry module (equipment + entities)

import express from 'express';
import * as controller from '../controllers/assetRegistryController';
import {
  createAssetValidation,
  updateAssetValidation,
  deleteAssetValidation,
  linkContractAssetsValidation,
  getContractAssetsValidation
} from '../validators/assetRegistryValidators';

const router = express.Router();

/**
 * @route GET /api/asset-registry
 * @description List assets with optional filters (resource_type_id, status, is_live, limit, offset)
 *              Or get a single asset by id query param
 */
router.get('/', controller.listAssets);

/**
 * @route POST /api/asset-registry
 * @description Create a new asset (equipment or entity)
 * @body CreateAssetRequest
 */
router.post('/', createAssetValidation, controller.createAsset);

/**
 * @route PATCH /api/asset-registry?id=...
 * @description Update an existing asset
 * @body UpdateAssetRequest
 */
router.patch('/', updateAssetValidation, controller.updateAsset);

/**
 * @route DELETE /api/asset-registry?id=...
 * @description Soft-delete an asset
 */
router.delete('/', deleteAssetValidation, controller.deleteAsset);

/**
 * @route GET /api/asset-registry/children?parent_asset_id=...
 * @description Get child assets of a parent (hierarchy traversal)
 */
router.get('/children', controller.getChildren);

/**
 * @route GET /api/asset-registry/contract-assets?contract_id=...
 * @description Get all assets linked to a specific contract
 */
router.get('/contract-assets', getContractAssetsValidation, controller.getContractAssets);

/**
 * @route POST /api/asset-registry/contract-assets
 * @description Link multiple assets to a contract (upsert)
 * @body LinkContractAssetsRequest
 */
router.post('/contract-assets', linkContractAssetsValidation, controller.linkContractAssets);

/**
 * @route DELETE /api/asset-registry/contract-assets?contract_id=...&asset_id=...
 * @description Unlink a single asset from a contract
 */
router.delete('/contract-assets', controller.unlinkContractAsset);

export default router;
