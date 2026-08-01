// src/routes/jtdTenantSettingsRoutes.ts
// Tenant-facing JTD message-type settings — per-message-type on/off + preview.
import express from 'express';
import * as jtdTenantSettingsController from '../controllers/jtdTenantSettingsController';

const router = express.Router();

router.get('/jtd/message-types', jtdTenantSettingsController.listMessageTypes);
router.patch('/jtd/message-types/:code', jtdTenantSettingsController.toggleMessageType);

export default router;
