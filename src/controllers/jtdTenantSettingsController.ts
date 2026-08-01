// src/controllers/jtdTenantSettingsController.ts
import { Request, Response } from 'express';
import { jtdTenantSettingsService } from '../services/jtdTenantSettingsService';

export const listMessageTypes = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    const data = await jtdTenantSettingsService.listMessageTypes(authHeader, tenantId);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error('Error in listMessageTypes controller:', error);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    return res.status(500).json({ error: 'Failed to fetch message types' });
  }
};

export const toggleMessageType = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const sourceTypeCode = req.params.code;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    if (!sourceTypeCode) {
      return res.status(400).json({ error: 'Message type code is required' });
    }
    if (req.body.is_enabled === undefined) {
      return res.status(400).json({ error: 'is_enabled field is required' });
    }

    const result = await jtdTenantSettingsService.toggleMessageType(
      authHeader,
      tenantId,
      sourceTypeCode,
      req.body.is_enabled
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in toggleMessageType controller:', error);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    return res.status(500).json({ error: 'Failed to update message type setting' });
  }
};
