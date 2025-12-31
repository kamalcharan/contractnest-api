// src/routes/fkonboardingProxy.ts
// Proxy for FamilyKnows FKonboarding Edge Function
// Only handles requests with x-product: familyknows header

import { Router, Request, Response } from 'express';

const router = Router();

// FamilyKnows Supabase Edge Function URL
const FK_EDGE_URL = process.env.FK_SUPABASE_URL
  ? `${process.env.FK_SUPABASE_URL}/functions/v1/FKonboarding`
  : null;

// Proxy all FKonboarding requests to FamilyKnows Edge Function
router.all('/:path(*)', async (req: Request, res: Response) => {
  try {
    // Check if this is a FamilyKnows request
    const product = req.headers['x-product'] as string;
    if (product !== 'familyknows') {
      return res.status(400).json({
        error: 'FKonboarding is only available for FamilyKnows product',
        message: 'Missing or invalid x-product header'
      });
    }

    // Check if FamilyKnows Edge URL is configured
    if (!FK_EDGE_URL) {
      console.error('FK_SUPABASE_URL not configured');
      return res.status(503).json({
        error: 'FamilyKnows service not configured',
        message: 'FK_SUPABASE_URL environment variable is not set'
      });
    }

    const path = req.params.path || '';
    const targetUrl = `${FK_EDGE_URL}/${path}`;

    console.log(`[FKonboarding Proxy] ${req.method} ${path} -> ${targetUrl}`);

    // Forward headers (exclude host and content-length as they'll be set by fetch)
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-product': 'familyknows',
    };

    // Forward x-tenant-id if present
    if (req.headers['x-tenant-id']) {
      forwardHeaders['x-tenant-id'] = req.headers['x-tenant-id'] as string;
    }

    // Add Supabase anon key for Edge Function access
    if (process.env.FK_SUPABASE_KEY) {
      forwardHeaders['apikey'] = process.env.FK_SUPABASE_KEY;

      // Forward the user's Authorization header (required for onboarding)
      if (req.headers.authorization) {
        forwardHeaders['Authorization'] = req.headers.authorization as string;
      } else {
        forwardHeaders['Authorization'] = `Bearer ${process.env.FK_SUPABASE_KEY}`;
      }
    }

    // Make the request to FKonboarding Edge Function
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    };

    // Add body for non-GET requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Get response data
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Forward response status and data
    res.status(response.status);

    // Forward relevant headers
    const corsHeaders = response.headers.get('access-control-allow-origin');
    if (corsHeaders) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders);
    }

    if (typeof data === 'string') {
      res.send(data);
    } else {
      res.json(data);
    }

  } catch (error: any) {
    console.error('[FKonboarding Proxy] Error:', error.message);
    res.status(502).json({
      error: 'FKonboarding proxy error',
      message: error.message || 'Failed to connect to FamilyKnows onboarding service'
    });
  }
});

export default router;
