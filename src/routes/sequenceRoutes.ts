// src/routes/sequenceRoutes.ts
// API routes for Sequence Numbers feature
// Follows the same pattern as masterDataRoutes.ts

import express from 'express';
import { Request, Response } from 'express';
import axios from 'axios';

const router = express.Router();

// =================================================================
// Helper: Build headers for edge function calls
// =================================================================
const buildHeaders = (req: Request) => {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'] as string;
  const environment = req.headers['x-environment'] as string || 'live';

  return {
    Authorization: authHeader || '',
    'x-tenant-id': tenantId,
    'x-environment': environment,
    'Content-Type': 'application/json'
  };
};

// =================================================================
// GET /health - Health check
// =================================================================
router.get('/health', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/health`,
      { headers: buildHeaders(req) }
    );
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Health check error:', error.message);
    return res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message
    });
  }
});

// =================================================================
// GET /configs - List all sequence configurations
// =================================================================
router.get('/configs', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    console.log('[SequenceRoutes] GET /configs', { tenantId, environment });

    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/configs`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error getting configs:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

// =================================================================
// GET /status - Get sequence status with current values
// =================================================================
router.get('/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    console.log('[SequenceRoutes] GET /status', { tenantId, environment });

    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/status`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error getting status:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

// =================================================================
// GET /next/:code - Get next formatted sequence number
// =================================================================
router.get('/next/:code', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';
    const code = req.params.code;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!code) {
      return res.status(400).json({ error: 'Sequence code is required' });
    }

    console.log('[SequenceRoutes] GET /next/:code', { tenantId, code, environment });

    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/next/${code}`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error getting next sequence:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

// =================================================================
// POST /configs - Create new sequence configuration
// =================================================================
router.post('/configs', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    console.log('[SequenceRoutes] POST /configs', { tenantId, body: req.body });

    const response = await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/configs`,
      req.body,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(201).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error creating config:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

// =================================================================
// PATCH /configs/:id - Update sequence configuration
// =================================================================
router.patch('/configs/:id', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';
    const configId = req.params.id;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!configId) {
      return res.status(400).json({ error: 'Config ID is required' });
    }

    console.log('[SequenceRoutes] PATCH /configs/:id', { tenantId, configId, body: req.body });

    const response = await axios.patch(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/configs/${configId}`,
      req.body,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error updating config:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

// =================================================================
// DELETE /configs/:id - Delete sequence configuration
// =================================================================
router.delete('/configs/:id', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';
    const configId = req.params.id;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!configId) {
      return res.status(400).json({ error: 'Config ID is required' });
    }

    console.log('[SequenceRoutes] DELETE /configs/:id', { tenantId, configId });

    const response = await axios.delete(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/configs/${configId}`,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error deleting config:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

// =================================================================
// POST /reset/:code - Reset sequence to start value
// =================================================================
router.post('/reset/:code', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';
    const code = req.params.code;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!code) {
      return res.status(400).json({ error: 'Sequence code is required' });
    }

    console.log('[SequenceRoutes] POST /reset/:code', { tenantId, code, body: req.body });

    const response = await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/reset/${code}`,
      req.body,
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error resetting sequence:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

// =================================================================
// POST /seed - Seed default sequences for tenant (onboarding)
// =================================================================
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    console.log('[SequenceRoutes] POST /seed', { tenantId });

    const response = await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/seed`,
      {},
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error seeding sequences:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

// =================================================================
// POST /backfill/:code - Backfill existing records
// =================================================================
router.post('/backfill/:code', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const environment = req.headers['x-environment'] as string || 'live';
    const code = req.params.code;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    if (!code) {
      return res.status(400).json({ error: 'Sequence code is required' });
    }

    console.log('[SequenceRoutes] POST /backfill/:code', { tenantId, code });

    const response = await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/sequences/backfill/${code}`,
      {},
      {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
          'x-environment': environment,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('[SequenceRoutes] Error backfilling:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    return res.status(status).json({ error: message });
  }
});

export default router;
