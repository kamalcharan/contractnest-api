// src/routes/clientAssetRegistryRoutes.ts
// Routes for the Client Asset Registry module (client-owned equipment + entities)

import express from 'express';
import * as controller from '../controllers/clientAssetRegistryController';
import {
  createAssetValidation,
  updateAssetValidation,
  deleteAssetValidation,
  linkContractAssetsValidation,
  getContractAssetsValidation
} from '../validators/clientAssetRegistryValidators';

const router = express.Router();

/**
 * @route GET /api/client-asset-registry
 * @query id, contact_id, resource_type_id, status, is_live, limit, offset
 */
router.get('/', controller.listAssets);

/**
 * @route POST /api/client-asset-registry
 * @body CreateAssetRequest (owner_contact_id required)
 */
router.post('/', createAssetValidation, controller.createAsset);

/**
 * @route PATCH /api/client-asset-registry?id=...
 * @body UpdateAssetRequest
 */
router.patch('/', updateAssetValidation, controller.updateAsset);

/**
 * @route DELETE /api/client-asset-registry?id=...
 */
router.delete('/', deleteAssetValidation, controller.deleteAsset);

/**
 * @route GET /api/client-asset-registry/children?parent_asset_id=...
 */
router.get('/children', controller.getChildren);

/**
 * @route GET /api/client-asset-registry/contract-assets?contract_id=...
 */
router.get('/contract-assets', getContractAssetsValidation, controller.getContractAssets);

/**
 * @route POST /api/client-asset-registry/contract-assets
 * @body LinkContractAssetsRequest
 */
router.post('/contract-assets', linkContractAssetsValidation, controller.linkContractAssets);

/**
 * @route DELETE /api/client-asset-registry/contract-assets?contract_id=...&asset_id=...
 */
router.delete('/contract-assets', controller.unlinkContractAsset);

export default router;
