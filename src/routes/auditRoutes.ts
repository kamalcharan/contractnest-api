// src/routes/auditRoutes.ts
// API routes for audit log management
// Provides endpoints for querying, exporting, and analyzing audit logs

import express, { Request, Response } from 'express';
import { auditService, AuditSeverity, AuditQueryFilters } from '../services/auditService';
import { logAudit } from '../middleware/auditMiddleware';
import { captureException } from '../utils/sentry';

const router = express.Router();

/**
 * GET /api/audit-logs
 * Query audit logs with filters and pagination
 */
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!userToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    // Build query filters from request
    const filters: AuditQueryFilters = {
      tenantId: req.query.tenantId as string,
      userId: req.query.userId as string,
      action: req.query.action as string,
      resource: req.query.resource as string,
      severity: req.query.severity as AuditSeverity,
      success: req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
      orderBy: req.query.orderBy as any || 'created_at',
      orderDirection: req.query.orderDirection as any || 'desc'
    };
    
    // Validate date range
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }
    
    // Query logs
    const result = await auditService.query(filters, userToken);
    
    // Log the audit query itself
    await logAudit(req, {
      action: 'AUDIT_LOG_QUERY',
      resource: 'audit',
      metadata: { 
        filters,
        resultCount: result.logs.length
      },
      success: true
    });
    
    res.json({
      data: result.logs,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total
      }
    });
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    captureException(error, {
      tags: { source: 'audit_routes', action: 'query' }
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch audit logs',
      message: error.message 
    });
  }
});

/**
 * GET /api/audit-logs/stats
 * Get audit log statistics for a tenant
 */
router.get('/audit-logs/stats', async (req: Request, res: Response) => {
  try {
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!userToken || !tenantId) {
      return res.status(401).json({ error: 'Authorization and tenant ID required' });
    }
    
    // Parse date range (default to last 30 days)
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get statistics
    const stats = await auditService.getStatistics(tenantId, startDate, endDate, userToken);
    
    // Log the stats query
    await logAudit(req, {
      action: 'AUDIT_STATS_VIEW',
      resource: 'audit',
      metadata: { 
        tenantId,
        dateRange: { startDate, endDate }
      },
      success: true
    });
    
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching audit stats:', error);
    captureException(error, {
      tags: { source: 'audit_routes', action: 'stats' }
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch audit statistics',
      message: error.message 
    });
  }
});

/**
 * GET /api/audit-logs/export
 * Export audit logs in CSV or JSON format
 */
router.get('/audit-logs/export', async (req: Request, res: Response) => {
  try {
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    const format = (req.query.format as 'csv' | 'json') || 'csv';
    
    if (!userToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    // Validate format
    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Must be csv or json' });
    }
    
    // Build query filters
    const filters: AuditQueryFilters = {
      tenantId: req.query.tenantId as string,
      userId: req.query.userId as string,
      action: req.query.action as string,
      resource: req.query.resource as string,
      severity: req.query.severity as AuditSeverity,
      success: req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined
    };
    
    // Export logs
    const exportData = await auditService.exportLogs(filters, format, userToken);
    
    // Log the export
    await logAudit(req, {
      action: 'AUDIT_LOG_EXPORT',
      resource: 'audit',
      metadata: { 
        format,
        filters
      },
      success: true,
      severity: AuditSeverity.WARNING // Exports are sensitive operations
    });
    
    // Set appropriate headers
    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(exportData);
  } catch (error: any) {
    console.error('Error exporting audit logs:', error);
    captureException(error, {
      tags: { source: 'audit_routes', action: 'export' }
    });
    
    res.status(500).json({ 
      error: 'Failed to export audit logs',
      message: error.message 
    });
  }
});

/**
 * GET /api/audit-logs/:id
 * Get a specific audit log entry
 */
router.get('/audit-logs/:id', async (req: Request, res: Response) => {
  try {
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    const logId = req.params.id;
    
    if (!userToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    // Query single log entry
    const result = await auditService.query(
      { limit: 1, offset: 0 },
      userToken
    );
    
    const log = result.logs.find(l => l.id === logId);
    
    if (!log) {
      return res.status(404).json({ error: 'Audit log not found' });
    }
    
    res.json(log);
  } catch (error: any) {
    console.error('Error fetching audit log:', error);
    captureException(error, {
      tags: { source: 'audit_routes', action: 'get_single' }
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch audit log',
      message: error.message 
    });
  }
});

/**
 * GET /api/audit-logs/actions
 * Get list of available audit actions
 */
router.get('/audit-logs/actions', async (req: Request, res: Response) => {
  try {
    const { AuditAction } = await import('../services/auditService');
    
    const actions = Object.entries(AuditAction).map(([key, value]) => ({
      key,
      value,
      label: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
    }));
    
    res.json(actions);
  } catch (error: any) {
    console.error('Error fetching audit actions:', error);
    res.status(500).json({ error: 'Failed to fetch audit actions' });
  }
});

/**
 * GET /api/audit-logs/resources
 * Get list of available audit resources
 */
router.get('/audit-logs/resources', async (req: Request, res: Response) => {
  try {
    const { AuditResource } = await import('../services/auditService');
    
    const resources = Object.entries(AuditResource).map(([key, value]) => ({
      key,
      value,
      label: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
    }));
    
    res.json(resources);
  } catch (error: any) {
    console.error('Error fetching audit resources:', error);
    res.status(500).json({ error: 'Failed to fetch audit resources' });
  }
});

/**
 * POST /api/audit-logs/search
 * Advanced search with complex filters
 */
router.post('/audit-logs/search', async (req: Request, res: Response) => {
  try {
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!userToken) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    // Extract complex filters from body
    const {
      filters,
      pagination = { limit: 50, offset: 0 },
      sorting = { orderBy: 'created_at', orderDirection: 'desc' }
    } = req.body;
    
    // Merge filters with pagination and sorting
    const queryFilters: AuditQueryFilters = {
      ...filters,
      ...pagination,
      ...sorting
    };
    
    // Query logs
    const result = await auditService.query(queryFilters, userToken);
    
    // Log the search
    await logAudit(req, {
      action: 'AUDIT_LOG_SEARCH',
      resource: 'audit',
      metadata: { 
        filters: queryFilters,
        resultCount: result.logs.length
      },
      success: true
    });
    
    res.json({
      data: result.logs,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total
      }
    });
  } catch (error: any) {
    console.error('Error searching audit logs:', error);
    captureException(error, {
      tags: { source: 'audit_routes', action: 'search' }
    });
    
    res.status(500).json({ 
      error: 'Failed to search audit logs',
      message: error.message 
    });
  }
});

export default router;