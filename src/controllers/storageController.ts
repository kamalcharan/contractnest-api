// src/controllers/storageController.ts
// Storage controller with comprehensive audit logging integration
// Implements audit logging for all storage operations

import { Request, Response } from 'express';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL, validateSupabaseConfig } from '../utils/supabaseConfig';
import multer from 'multer';
import path from 'path';
import { storageService } from '../services/storageService';
import { checkFirebaseStatus } from '../utils/firebaseConfig';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middleware/auditMiddleware';
import { AuditAction, AuditResource, AuditSeverity } from '../constants/auditConstants';
import { StorageFile } from '../types/storage';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Accept allowed file types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'video/mp4'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
}).single('file');

// Configure multer for multiple file uploads
const uploadMultiple = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 10 // Maximum 10 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'video/mp4'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
}).array('files', 10);

// Helper to generate idempotency key
const generateIdempotencyKey = (tenantId: string, operation: string, identifier?: string): string => {
  return `${operation}-${tenantId}-${identifier || uuidv4()}-${Date.now()}`;
};

// Helper to extract rate limit info from response headers
const extractRateLimitInfo = (headers: any) => {
  return {
    remaining: headers['x-ratelimit-remaining'] || null,
    requestId: headers['x-request-id'] || null
  };
};

/**
 * Get storage statistics for the current tenant
 */
export const getStorageStats = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_storage', 'getStorageStats')) {
      // Log configuration error
      await logAudit(req, {
        action: AuditAction.SYSTEM_ERROR,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Supabase configuration',
        severity: AuditSeverity.CRITICAL
      });
      
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Authorization header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing x-tenant-id header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    try {
      console.log('🔍 Attempting to get storage stats for tenant:', tenantId);
      const stats = await storageService.getStorageStats(authHeader, tenantId);
      console.log('✅ Storage stats retrieved successfully:', stats);
      
      // Log successful stats retrieval
      await logAudit(req, {
        action: AuditAction.STORAGE_STATS_VIEW,
        resource: AuditResource.STORAGE,
        success: true,
        metadata: {
          storageQuota: stats.quota,
          storageUsed: stats.used,
          usagePercentage: stats.usagePercentage,
          totalFiles: stats.totalFiles
        }
      });
      
      return res.status(200).json(stats);
    } catch (error: any) {
      // If this is the specific "Storage not set up" error
      if (error.status === 404 && error.message === 'Storage not set up for this tenant') {
        console.log('Storage not set up, returning structured response with storageSetupComplete: false');
        
        // Log storage not setup
        await logAudit(req, {
          action: AuditAction.STORAGE_STATS_VIEW,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Storage not set up for tenant',
          severity: AuditSeverity.INFO
        });
        
        // Return a structured response with storageSetupComplete: false
        return res.status(200).json({
          storageSetupComplete: false,
          quota: 0,
          used: 0,
          available: 0,
          usagePercentage: 0,
          totalFiles: 0,
          categories: []
        });
      }
      
      // For other errors, rethrow to be caught by the outer catch block
      throw error;
    }
  } catch (error: any) {
    console.error('❌ Error in getStorageStats controller:', error);
    console.error('❌ Error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url
    });
    
    // Log error
    await logAudit(req, {
      action: AuditAction.STORAGE_STATS_VIEW,
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to get storage stats',
      severity: AuditSeverity.ERROR,
      metadata: {
        errorDetails: error.response?.data || error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'getStorageStats' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Setup storage for the current tenant
 */
export const setupStorage = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Authorization header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing x-tenant-id header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    // Generate idempotency key for this operation
    const idempotencyKey = generateIdempotencyKey(tenantId, 'setup');
    
    try {
      const setupResult = await storageService.setupStorage(authHeader, tenantId);
      
      // Log successful storage setup
      await logAudit(req, {
        action: AuditAction.STORAGE_SETUP,
        resource: AuditResource.STORAGE,
        resourceId: tenantId,
        success: true,
        metadata: {
          storageQuota: setupResult.quota,
          storageUsed: setupResult.used,
          storageAvailable: setupResult.available,
          idempotencyKey
        },
        severity: AuditSeverity.WARNING
      });
      
      return res.status(200).json(setupResult);
    } catch (error: any) {
      // Handle specific error cases
      if (error.response?.status === 400 && 
          error.response?.data?.error?.code === 'STORAGE_EXISTS') {
        // Storage already exists, log and return current stats
        await logAudit(req, {
          action: AuditAction.STORAGE_SETUP,
          resource: AuditResource.STORAGE,
          resourceId: tenantId,
          success: false,
          error: 'Storage already exists',
          severity: AuditSeverity.INFO
        });
        
        const stats = await storageService.getStorageStats(authHeader, tenantId);
        return res.status(200).json(stats);
      }
      
      throw error;
    }
  } catch (error: any) {
    console.error('Error in setupStorage controller:', error.message);
    
    // Log error
    await logAudit(req, {
      action: AuditAction.STORAGE_SETUP,
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to setup storage',
      severity: AuditSeverity.ERROR,
      metadata: {
        errorDetails: error.response?.data || error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'setupStorage' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get list of files for the current tenant - SIMPLIFIED VERSION
 */
export const listFiles = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_storage', 'listFiles')) {
      await logAudit(req, {
        action: AuditAction.SYSTEM_ERROR,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Supabase configuration',
        severity: AuditSeverity.CRITICAL
      });
      
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const category = req.query.category as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : undefined;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Authorization header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing x-tenant-id header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    try {
      // Verify storage is set up
      const isSetup = await storageService.isStorageSetupComplete(authHeader, tenantId);
      
      if (!isSetup) {
        // Log that storage is not setup
        await logAudit(req, {
          action: AuditAction.FILE_LIST,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Storage not set up',
          severity: AuditSeverity.INFO
        });
        
        // Return empty array for frontend to display empty state
        return res.status(200).json([]);
      }
      
      const result = await storageService.listFiles(authHeader, tenantId, category, page, pageSize);
      
      // Simple count for audit logging
      const fileCount = Array.isArray(result) ? result.length : (result as any).files?.length || 0;
      
      // Log successful file listing
      await logAudit(req, {
        action: AuditAction.FILE_LIST,
        resource: AuditResource.STORAGE,
        success: true,
        metadata: {
          category,
          page,
          pageSize,
          fileCount
        }
      });
      
      // Add rate limit info to response headers if available
      const rateLimitInfo = extractRateLimitInfo(res.getHeaders());
      if (rateLimitInfo.remaining) {
        res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining);
      }
      
      // Simply return whatever the service returns
      return res.status(200).json(result);
    } catch (error: any) {
      // If the storage isn't set up properly, return empty array instead of error
      if (error.response?.status === 404 &&
          error.response?.data?.error === 'Storage not set up for this tenant') {
        await logAudit(req, {
          action: AuditAction.FILE_LIST,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Storage not set up',
          severity: AuditSeverity.INFO
        });
        
        return res.status(200).json([]);
      }
      
      // For other errors, rethrow to be caught by the outer catch block
      throw error;
    }
  } catch (error: any) {
    console.error('Error in listFiles controller:', error.message);
    
    // Log error
    await logAudit(req, {
      action: AuditAction.FILE_LIST,
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to list files',
      severity: AuditSeverity.ERROR,
      metadata: {
        errorDetails: error.response?.data || error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'listFiles' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Upload a file for the current tenant
 */
export const uploadFile = async (req: Request, res: Response) => {
  // Multer processing is already handled in the route, no need to call it again
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_storage', 'uploadFile')) {
      await logAudit(req, {
        action: AuditAction.SYSTEM_ERROR,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Supabase configuration',
        severity: AuditSeverity.CRITICAL
      });
      
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Authorization header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing x-tenant-id header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    // Verify storage is set up
    const isSetup = await storageService.isStorageSetupComplete(authHeader, tenantId);
    if (!isSetup) {
      await logAudit(req, {
        action: AuditAction.FILE_UPLOAD,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Storage not set up',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ 
        error: 'Storage not set up for this tenant. Please set up storage first.' 
      });
    }
    
    // Check for file and category
    if (!req.file) {
      await logAudit(req, {
        action: AuditAction.FILE_UPLOAD,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'No file provided',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const category = req.body.category as string;
    if (!category) {
      await logAudit(req, {
        action: AuditAction.FILE_UPLOAD,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Category is required',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'Category is required' });
    }
    
    // Extract metadata if provided
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    
    // Check current storage quota before uploading
    const stats = await storageService.getStorageStats(authHeader, tenantId);
    if (req.file.size > stats.available) {
      await logAudit(req, {
        action: AuditAction.STORAGE_QUOTA_EXCEEDED,
        resource: AuditResource.STORAGE,
        success: false,
        metadata: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          availableSpace: stats.available,
          category
        },
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ 
        error: 'Not enough storage space available',
        availableSpace: stats.available,
        requiredSpace: req.file.size
      });
    }
    
    // Upload the file
    const result = await storageService.uploadFile(
      authHeader, 
      tenantId, 
      req.file.buffer, 
      req.file.originalname,
      req.file.size,
      req.file.mimetype,
      category,
      metadata
    );
    
    // Log successful upload
    await logAudit(req, {
      action: AuditAction.FILE_UPLOAD,
      resource: AuditResource.STORAGE,
      resourceId: result.id,
      success: true,
      metadata: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        category,
        fileId: result.id,
        downloadUrl: result.download_url,
        metadata
      }
    });
    
    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Error in uploadFile controller:', error.message);
    
    // Log error
    await logAudit(req, {
      action: AuditAction.FILE_UPLOAD,
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to upload file',
      severity: AuditSeverity.ERROR,
      metadata: {
        fileName: req.file?.originalname,
        fileSize: req.file?.size,
        category: req.body.category,
        errorDetails: error.response?.data || error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'uploadFile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'An unknown error occurred';
    
    // Handle specific error codes
    if (error.response?.data?.error?.code === 'RATE_LIMIT_EXCEEDED') {
      await logAudit(req, {
        action: AuditAction.RATE_LIMIT_EXCEEDED,
        resource: AuditResource.STORAGE,
        success: false,
        severity: AuditSeverity.WARNING
      });
      
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: 60 // seconds
      });
    }
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Upload multiple files for the current tenant
 */
export const uploadMultipleFiles = async (req: Request, res: Response) => {
  // Handle multiple file upload with multer
  uploadMultiple(req, res, async (err) => {
    if (err) {
      await logAudit(req, {
        action: AuditAction.FILE_UPLOAD,
        resource: AuditResource.STORAGE,
        success: false,
        error: err.message || 'Error uploading files',
        severity: AuditSeverity.ERROR,
        metadata: { uploadType: 'multiple' }
      });
      
      return res.status(400).json({ 
        error: err.message || 'Error uploading files' 
      });
    }
    
    try {
      // Validate Supabase configuration
      if (!validateSupabaseConfig('api_storage', 'uploadMultipleFiles')) {
        await logAudit(req, {
          action: AuditAction.SYSTEM_ERROR,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Missing Supabase configuration',
          severity: AuditSeverity.CRITICAL
        });
        
        return res.status(500).json({ 
          error: 'Server configuration error: Missing Supabase configuration' 
        });
      }

      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      
      if (!authHeader) {
        await logAudit(req, {
          action: AuditAction.UNAUTHORIZED_ACCESS,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Missing Authorization header',
          severity: AuditSeverity.WARNING
        });
        
        return res.status(401).json({ error: 'Authorization header is required' });
      }
      
      if (!tenantId) {
        await logAudit(req, {
          action: AuditAction.UNAUTHORIZED_ACCESS,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Missing x-tenant-id header',
          severity: AuditSeverity.WARNING
        });
        
        return res.status(400).json({ error: 'x-tenant-id header is required' });
      }
      
      // Verify storage is set up
      const isSetup = await storageService.isStorageSetupComplete(authHeader, tenantId);
      if (!isSetup) {
        await logAudit(req, {
          action: AuditAction.FILE_UPLOAD,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Storage not set up',
          severity: AuditSeverity.WARNING,
          metadata: { uploadType: 'multiple' }
        });
        
        return res.status(400).json({ 
          error: 'Storage not set up for this tenant. Please set up storage first.' 
        });
      }
      
      // Check for files
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        await logAudit(req, {
          action: AuditAction.FILE_UPLOAD,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'No files provided',
          severity: AuditSeverity.WARNING,
          metadata: { uploadType: 'multiple' }
        });
        
        return res.status(400).json({ error: 'No files provided' });
      }
      
      // Check current storage quota
      const stats = await storageService.getStorageStats(authHeader, tenantId);
      const totalUploadSize = req.files.reduce((sum, file) => sum + file.size, 0);
      
      if (totalUploadSize > stats.available) {
        await logAudit(req, {
          action: AuditAction.STORAGE_QUOTA_EXCEEDED,
          resource: AuditResource.STORAGE,
          success: false,
          metadata: {
            fileCount: req.files.length,
            totalSize: totalUploadSize,
            availableSpace: stats.available,
            uploadType: 'multiple'
          },
          severity: AuditSeverity.WARNING
        });
        
        return res.status(400).json({ 
          error: 'Not enough storage space available',
          availableSpace: stats.available,
          requiredSpace: totalUploadSize
        });
      }
      
      // Prepare files for upload
      const filesToUpload = req.files.map((file, index) => {
        const category = req.body.categories?.[index] || req.body.category;
        const metadata = req.body.metadata?.[index] ? JSON.parse(req.body.metadata[index]) : {};
        
        return {
          buffer: file.buffer,
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          category,
          metadata
        };
      });
      
      // Upload files with progress tracking
      const results = await storageService.uploadMultipleFiles(
        authHeader,
        tenantId,
        filesToUpload,
        (completed, total) => {
          // Could emit progress via WebSocket if needed
          console.log(`Upload progress: ${completed}/${total}`);
        }
      );
      
      // Count successes and failures
      const successes = results.filter(r => r.file).length;
      const failures = results.filter(r => r.error).length;
      
      // Log batch upload result
      await logAudit(req, {
        action: AuditAction.FILE_UPLOAD,
        resource: AuditResource.STORAGE,
        success: failures === 0,
        metadata: {
          uploadType: 'multiple',
          totalFiles: results.length,
          successCount: successes,
          failureCount: failures,
          totalSize: totalUploadSize,
          results: results.map(r => ({
            fileName: r.fileName,
            success: !!r.file,
            fileId: r.file?.id,
            error: r.error
          }))
        },
        severity: failures > 0 ? AuditSeverity.WARNING : AuditSeverity.INFO
      });
      
      return res.status(207).json({ // 207 Multi-Status
        message: `Uploaded ${successes} files successfully${failures > 0 ? `, ${failures} failed` : ''}`,
        results,
        summary: {
          total: results.length,
          succeeded: successes,
          failed: failures
        }
      });
    } catch (error: any) {
      console.error('Error in uploadMultipleFiles controller:', error.message);
      
      await logAudit(req, {
        action: AuditAction.FILE_UPLOAD,
        resource: AuditResource.STORAGE,
        success: false,
        error: error.message || 'Failed to upload multiple files',
        severity: AuditSeverity.ERROR,
        metadata: {
          uploadType: 'multiple',
          fileCount: req.files?.length,
          errorDetails: error.response?.data || error.stack
        }
      });
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_storage', action: 'uploadMultipleFiles' },
        status: error.response?.status
      });

      const status = error.response?.status || 500;
      const message = error.response?.data?.error?.message || error.message || 'An unknown error occurred';
      
      return res.status(status).json({ error: message });
    }
  });
};

/**
 * Delete a file
 */
export const deleteFile = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_storage', 'deleteFile')) {
      await logAudit(req, {
        action: AuditAction.SYSTEM_ERROR,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Supabase configuration',
        severity: AuditSeverity.CRITICAL
      });
      
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const fileId = req.params.fileId;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Authorization header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing x-tenant-id header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!fileId) {
      await logAudit(req, {
        action: AuditAction.FILE_DELETE,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'File ID is required',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'File ID is required' });
    }
    
    // Verify storage is set up
    const isSetup = await storageService.isStorageSetupComplete(authHeader, tenantId);
    if (!isSetup) {
      await logAudit(req, {
        action: AuditAction.FILE_DELETE,
        resource: AuditResource.STORAGE,
        resourceId: fileId,
        success: false,
        error: 'Storage not set up',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ 
        error: 'Storage not set up for this tenant. Please set up storage first.' 
      });
    }
    
    const result = await storageService.deleteFile(authHeader, tenantId, fileId);
    
    // Log successful deletion
    await logAudit(req, {
      action: AuditAction.FILE_DELETE,
      resource: AuditResource.STORAGE,
      resourceId: fileId,
      success: true,
      metadata: {
        fileId,
        message: result.message
      }
    });
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in deleteFile controller:', error.message);
    
    await logAudit(req, {
      action: AuditAction.FILE_DELETE,
      resource: AuditResource.STORAGE,
      resourceId: req.params.fileId,
      success: false,
      error: error.message || 'Failed to delete file',
      severity: AuditSeverity.ERROR,
      metadata: {
        errorDetails: error.response?.data || error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'deleteFile' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Delete multiple files
 */
export const deleteMultipleFiles = async (req: Request, res: Response) => {
  try {
    // Validate Supabase configuration
    if (!validateSupabaseConfig('api_storage', 'deleteMultipleFiles')) {
      await logAudit(req, {
        action: AuditAction.SYSTEM_ERROR,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Supabase configuration',
        severity: AuditSeverity.CRITICAL
      });
      
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase configuration' 
      });
    }

    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    const { fileIds } = req.body;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing Authorization header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Missing x-tenant-id header',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      await logAudit(req, {
        action: AuditAction.FILE_DELETE,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'fileIds array is required',
        severity: AuditSeverity.WARNING,
        metadata: { deleteType: 'multiple' }
      });
      
      return res.status(400).json({ error: 'fileIds array is required' });
    }
    
    // Verify storage is set up
    const isSetup = await storageService.isStorageSetupComplete(authHeader, tenantId);
    if (!isSetup) {
      await logAudit(req, {
        action: AuditAction.FILE_DELETE,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Storage not set up',
        severity: AuditSeverity.WARNING,
        metadata: { deleteType: 'multiple', fileCount: fileIds.length }
      });
      
      return res.status(400).json({ 
        error: 'Storage not set up for this tenant. Please set up storage first.' 
      });
    }
    
    // Delete files
    const results = await storageService.deleteMultipleFiles(authHeader, tenantId, fileIds);
    
    // Count successes and failures
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;
    
    // Log batch delete result
    await logAudit(req, {
      action: AuditAction.FILE_DELETE,
      resource: AuditResource.STORAGE,
      success: failures === 0,
      metadata: {
        deleteType: 'multiple',
        totalFiles: results.length,
        successCount: successes,
        failureCount: failures,
        results: results.map(r => ({
          fileId: r.fileId,
          success: r.success,
          error: r.error
        }))
      },
      severity: failures > 0 ? AuditSeverity.WARNING : AuditSeverity.INFO
    });
    
    return res.status(207).json({ // 207 Multi-Status
      message: `Deleted ${successes} files successfully${failures > 0 ? `, ${failures} failed` : ''}`,
      results,
      summary: {
        total: results.length,
        succeeded: successes,
        failed: failures
      }
    });
  } catch (error: any) {
    console.error('Error in deleteMultipleFiles controller:', error.message);
    
    await logAudit(req, {
      action: AuditAction.FILE_DELETE,
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to delete multiple files',
      severity: AuditSeverity.ERROR,
      metadata: {
        deleteType: 'multiple',
        fileCount: req.body.fileIds?.length,
        errorDetails: error.response?.data || error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'deleteMultipleFiles' },
      status: error.response?.status
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Get available storage categories
 */
export const getStorageCategories = async (req: Request, res: Response) => {
  try {
    const categories = storageService.getStorageCategories();
    
    // Log category retrieval (low severity as it's a simple read operation)
    await logAudit(req, {
      action: 'STORAGE_CATEGORIES_VIEW',
      resource: AuditResource.STORAGE,
      success: true,
      metadata: {
        categoryCount: categories.length
      }
    });
    
    return res.status(200).json(categories);
  } catch (error: any) {
    console.error('Error in getStorageCategories controller:', error.message);
    
    await logAudit(req, {
      action: 'STORAGE_CATEGORIES_VIEW',
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to retrieve storage categories',
      severity: AuditSeverity.ERROR
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'getStorageCategories' },
      status: error.response?.status
    });

    return res.status(500).json({ error: 'Failed to retrieve storage categories' });
  }
};

/**
 * Get Firebase connection status
 */
export const getFirebaseStatus = async (req: Request, res: Response) => {
  try {
    const status = await checkFirebaseStatus();
    
    // Log Firebase status check (admin operation)
    await logAudit(req, {
      action: 'FIREBASE_STATUS_CHECK',
      resource: AuditResource.SYSTEM,
      success: true,
      metadata: {
        status: status.status,
        isAdmin: req.headers['x-is-admin'] === 'true'
      },
      severity: AuditSeverity.INFO
    });
    
    return res.status(status.status === 'connected' ? 200 : 500).json(status);
  } catch (error: any) {
    console.error('Error in getFirebaseStatus controller:', error.message);
    
    await logAudit(req, {
      action: 'FIREBASE_STATUS_CHECK',
      resource: AuditResource.SYSTEM,
      success: false,
      error: error.message || 'Failed to check Firebase status',
      severity: AuditSeverity.ERROR
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'getFirebaseStatus' }
    });

    return res.status(500).json({ 
      status: 'error',
      message: 'Failed to check Firebase status',
      error: error.message || 'Unknown error'
    });
  }
};

// Admin/diagnostic endpoints remain the same but with enhanced error handling and audit logging
export const getTenantStorageStructure = async (req: Request, res: Response) => {
  try {
    // Check if the user has admin permissions
    const isAdmin = req.headers['x-is-admin'] === 'true';
    
    if (!isAdmin) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Admin access required',
        severity: AuditSeverity.WARNING,
        metadata: { operation: 'getTenantStorageStructure' }
      });
      
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const tenantId = req.query.tenantId as string;
    
    if (!tenantId) {
      await logAudit(req, {
        action: 'ADMIN_STORAGE_STRUCTURE_VIEW',
        resource: AuditResource.STORAGE,
        success: false,
        error: 'tenantId query parameter is required',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'tenantId query parameter is required' });
    }
    
    const structure = await storageService.getTenantStorageStructure(
      req.headers.authorization as string,
      tenantId
    );
    
    await logAudit(req, {
      action: 'ADMIN_STORAGE_STRUCTURE_VIEW',
      resource: AuditResource.STORAGE,
      resourceId: tenantId,
      success: true,
      metadata: {
        isAdmin: true,
        tenantId,
        totalFiles: structure.totalFiles,
        totalSize: structure.totalSize
      },
      severity: AuditSeverity.WARNING // Admin operation
    });
    
    return res.status(200).json(structure);
  } catch (error: any) {
    console.error('Error in getTenantStorageStructure controller:', error.message);
    
    await logAudit(req, {
      action: 'ADMIN_STORAGE_STRUCTURE_VIEW',
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to get tenant storage structure',
      severity: AuditSeverity.ERROR,
      metadata: {
        isAdmin: true,
        tenantId: req.query.tenantId,
        errorDetails: error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'getTenantStorageStructure' }
    });

    return res.status(500).json({ 
      error: 'Failed to get tenant storage structure',
      message: error.message
    });
  }
};

export const listDiagnosticFiles = async (req: Request, res: Response) => {
  try {
    // Check if the user has admin permissions
    const isAdmin = req.headers['x-is-admin'] === 'true';
    
    if (!isAdmin) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Admin access required',
        severity: AuditSeverity.WARNING,
        metadata: { operation: 'listDiagnosticFiles' }
      });
      
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const tenantId = req.query.tenantId as string;
    const path = req.query.path as string;
    
    if (!tenantId) {
      await logAudit(req, {
        action: 'ADMIN_DIAGNOSTIC_FILES_LIST',
        resource: AuditResource.STORAGE,
        success: false,
        error: 'tenantId query parameter is required',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'tenantId query parameter is required' });
    }
    
    const files = await storageService.listDiagnosticFiles(
      req.headers.authorization as string,
      tenantId,
      path
    );
    
    await logAudit(req, {
      action: 'ADMIN_DIAGNOSTIC_FILES_LIST',
      resource: AuditResource.STORAGE,
      resourceId: tenantId,
      success: true,
      metadata: {
        isAdmin: true,
        tenantId,
        path,
        fileCount: files.length
      },
      severity: AuditSeverity.WARNING // Admin operation
    });
    
    return res.status(200).json(files);
  } catch (error: any) {
    console.error('Error in listDiagnosticFiles controller:', error.message);
    
    await logAudit(req, {
      action: 'ADMIN_DIAGNOSTIC_FILES_LIST',
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to list diagnostic files',
      severity: AuditSeverity.ERROR,
      metadata: {
        isAdmin: true,
        tenantId: req.query.tenantId,
        path: req.query.path,
        errorDetails: error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'listDiagnosticFiles' }
    });

    return res.status(500).json({ 
      error: 'Failed to list diagnostic files',
      message: error.message
    });
  }
};

export const uploadDiagnosticFile = async (req: Request, res: Response) => {
  // Handle file upload with multer
  upload(req, res, async (err) => {
    if (err) {
      await logAudit(req, {
        action: 'ADMIN_DIAGNOSTIC_FILE_UPLOAD',
        resource: AuditResource.STORAGE,
        success: false,
        error: err.message || 'Error uploading file',
        severity: AuditSeverity.ERROR,
        metadata: { isAdmin: true }
      });
      
      return res.status(400).json({ 
        error: err.message || 'Error uploading file' 
      });
    }
    
    try {
      // Check if the user has admin permissions
      const isAdmin = req.headers['x-is-admin'] === 'true';
      
      if (!isAdmin) {
        await logAudit(req, {
          action: AuditAction.UNAUTHORIZED_ACCESS,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Admin access required',
          severity: AuditSeverity.WARNING,
          metadata: { operation: 'uploadDiagnosticFile' }
        });
        
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const authHeader = req.headers.authorization;
      const tenantId = req.body.tenantId;
      const path = req.body.path;
      
      if (!authHeader) {
        await logAudit(req, {
          action: AuditAction.UNAUTHORIZED_ACCESS,
          resource: AuditResource.STORAGE,
          success: false,
          error: 'Authorization header is required',
          severity: AuditSeverity.WARNING
        });
        
        return res.status(401).json({ error: 'Authorization header is required' });
      }
      
      if (!tenantId) {
        await logAudit(req, {
          action: 'ADMIN_DIAGNOSTIC_FILE_UPLOAD',
          resource: AuditResource.STORAGE,
          success: false,
          error: 'tenantId field is required',
          severity: AuditSeverity.WARNING
        });
        
        return res.status(400).json({ error: 'tenantId field is required' });
      }
      
      if (!path) {
        await logAudit(req, {
          action: 'ADMIN_DIAGNOSTIC_FILE_UPLOAD',
          resource: AuditResource.STORAGE,
          success: false,
          error: 'path field is required',
          severity: AuditSeverity.WARNING
        });
        
        return res.status(400).json({ error: 'path field is required' });
      }
      
      // Check for file
      if (!req.file) {
        await logAudit(req, {
          action: 'ADMIN_DIAGNOSTIC_FILE_UPLOAD',
          resource: AuditResource.STORAGE,
          success: false,
          error: 'No file provided',
          severity: AuditSeverity.WARNING
        });
        
        return res.status(400).json({ error: 'No file provided' });
      }
      
      // Upload the file
      const result = await storageService.uploadDiagnosticFile(
        authHeader,
        tenantId,
        req.file.buffer,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        path
      );
      
      await logAudit(req, {
        action: 'ADMIN_DIAGNOSTIC_FILE_UPLOAD',
        resource: AuditResource.STORAGE,
        resourceId: tenantId,
        success: true,
        metadata: {
          isAdmin: true,
          tenantId,
          path,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          fileType: req.file.mimetype,
          downloadUrl: result.downloadUrl
        },
        severity: AuditSeverity.WARNING // Admin operation
      });
      
      return res.status(201).json(result);
    } catch (error: any) {
      console.error('Error in uploadDiagnosticFile controller:', error.message);
      
      await logAudit(req, {
        action: 'ADMIN_DIAGNOSTIC_FILE_UPLOAD',
        resource: AuditResource.STORAGE,
        success: false,
        error: error.message || 'Failed to upload diagnostic file',
        severity: AuditSeverity.ERROR,
        metadata: {
          isAdmin: true,
          tenantId: req.body.tenantId,
          path: req.body.path,
          fileName: req.file?.originalname,
          errorDetails: error.stack
        }
      });
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_storage', action: 'uploadDiagnosticFile' }
      });

      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || 'An unknown error occurred';
      
      return res.status(status).json({ error: message });
    }
  });
};

export const deleteDiagnosticFile = async (req: Request, res: Response) => {
  try {
    // Check if the user has admin permissions
    const isAdmin = req.headers['x-is-admin'] === 'true';
    
    if (!isAdmin) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Admin access required',
        severity: AuditSeverity.WARNING,
        metadata: { operation: 'deleteDiagnosticFile' }
      });
      
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const authHeader = req.headers.authorization;
    const tenantId = req.query.tenantId as string;
    const filePath = req.query.filePath as string;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Authorization header is required',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: 'ADMIN_DIAGNOSTIC_FILE_DELETE',
        resource: AuditResource.STORAGE,
        success: false,
        error: 'tenantId query parameter is required',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'tenantId query parameter is required' });
    }
    
    if (!filePath) {
      await logAudit(req, {
        action: 'ADMIN_DIAGNOSTIC_FILE_DELETE',
        resource: AuditResource.STORAGE,
        success: false,
        error: 'filePath query parameter is required',
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ error: 'filePath query parameter is required' });
    }
    
    const result = await storageService.deleteDiagnosticFile(
      authHeader,
      tenantId,
      filePath
    );
    
    await logAudit(req, {
      action: 'ADMIN_DIAGNOSTIC_FILE_DELETE',
      resource: AuditResource.STORAGE,
      resourceId: tenantId,
      success: true,
      metadata: {
        isAdmin: true,
        tenantId,
        filePath,
        message: result.message
      },
      severity: AuditSeverity.WARNING // Admin operation
    });
    
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in deleteDiagnosticFile controller:', error.message);
    
    await logAudit(req, {
      action: 'ADMIN_DIAGNOSTIC_FILE_DELETE',
      resource: AuditResource.STORAGE,
      success: false,
      error: error.message || 'Failed to delete diagnostic file',
      severity: AuditSeverity.ERROR,
      metadata: {
        isAdmin: true,
        tenantId: req.query.tenantId,
        filePath: req.query.filePath,
        errorDetails: error.stack
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_storage', action: 'deleteDiagnosticFile' }
    });

    return res.status(500).json({ 
      error: 'Failed to delete diagnostic file',
      message: error.message
    });
  }
};