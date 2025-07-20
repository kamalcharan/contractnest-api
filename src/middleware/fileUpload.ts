// src/middleware/fileUpload.ts
// File upload middleware with support for single and multiple file uploads
// Implements comprehensive validation and error handling with audit logging

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { captureException } from '../utils/sentry';
import { logAudit } from './auditMiddleware';
import { AuditAction, AuditResource, AuditSeverity } from '../constants/auditConstants';

// Define allowed file types
const ALLOWED_FILE_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  
  // Videos
  'video/mp4'
];

// Maximum file size in bytes (5MB per file)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Maximum total size for multiple uploads (20MB)
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;

// Maximum number of files in a single request
const MAX_FILE_COUNT = 10;

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Create multer instance for single file
const uploadSingle = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, callback) => {
    // Check file type
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});

// Create multer instance for multiple files
const uploadMultiple = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILE_COUNT
  },
  fileFilter: (req, file, callback) => {
    // Check file type
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});

/**
 * Middleware to handle single file upload
 */
export const handleFileUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadSingle.single('file')(req, res, (err) => {
    if (err) {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: `File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
            code: 'FILE_TOO_LARGE'
          });
        }
      }
      
      // Log error
      console.error('File upload error:', err);
      captureException(err, {
        tags: { source: 'file_upload', error_type: 'upload_error' }
      });
      
      return res.status(400).json({ error: err.message });
    }
    
    // Validate file exists in request
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    // Check for category
    if (!req.body.category) {
      return res.status(400).json({ error: 'Category is required' });
    }
    
    // Add validation for valid category values
    const validCategories = ['contact_photos', 'contract_media', 'service_images', 'documents'];
    if (!validCategories.includes(req.body.category)) {
      return res.status(400).json({ 
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
      });
    }
    
    // Continue to next middleware/controller
    next();
  });
};

/**
 * Middleware to handle multiple file uploads
 */
export const handleMultipleFileUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadMultiple.array('files', MAX_FILE_COUNT)(req, res, (err) => {
    if (err) {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: `File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit per file`,
            code: 'FILE_TOO_LARGE'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: `Cannot upload more than ${MAX_FILE_COUNT} files at once`,
            code: 'TOO_MANY_FILES'
          });
        }
      }
      
      // Log error
      console.error('Multiple file upload error:', err);
      captureException(err, {
        tags: { source: 'file_upload', error_type: 'multiple_upload_error' }
      });
      
      return res.status(400).json({ error: err.message });
    }
    
    // Validate files exist in request
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }
    
    // Check total size
    const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return res.status(400).json({ 
        error: `Total file size exceeds the ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit`,
        code: 'TOTAL_SIZE_TOO_LARGE'
      });
    }
    
    // Validate categories
    const validCategories = ['contact_photos', 'contract_media', 'service_images', 'documents'];
    
    // Check if we have categories for each file or a single category for all
    if (req.body.categories) {
      // Multiple categories provided
      const categories = Array.isArray(req.body.categories) 
        ? req.body.categories 
        : JSON.parse(req.body.categories);
      
      if (categories.length !== req.files.length) {
        return res.status(400).json({ 
          error: 'Number of categories must match number of files' 
        });
      }
      
      // Validate each category
      for (const category of categories) {
        if (!validCategories.includes(category)) {
          return res.status(400).json({ 
            error: `Invalid category: ${category}. Must be one of: ${validCategories.join(', ')}` 
          });
        }
      }
    } else if (req.body.category) {
      // Single category for all files
      if (!validCategories.includes(req.body.category)) {
        return res.status(400).json({ 
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
        });
      }
    } else {
      return res.status(400).json({ error: 'Category is required' });
    }
    
    // Continue to next middleware/controller
    next();
  });
};

/**
 * Validate storage setup middleware
 * Checks if tenant has storage setup before allowing file operations
 */
export const validateStorageSetup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Authorization header is required',
        severity: AuditSeverity.WARNING,
        metadata: {
          operation: 'validateStorageSetup'
        }
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: AuditAction.VALIDATION_ERROR,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'x-tenant-id header is required',
        severity: AuditSeverity.WARNING,
        metadata: {
          operation: 'validateStorageSetup'
        }
      });
      
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    // Import service here to avoid circular dependencies
    const { storageService } = require('../services/storageService');
    
    // Check if storage is set up for the tenant
    const isStorageSetup = await storageService.isStorageSetupComplete(
      authHeader,
      tenantId
    );
    
    if (!isStorageSetup) {
      await logAudit(req, {
        action: AuditAction.STORAGE_STATS_VIEW,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Storage not set up',
        severity: AuditSeverity.INFO,
        metadata: {
          operation: 'validateStorageSetup',
          code: 'STORAGE_NOT_SETUP'
        }
      });
      
      return res.status(400).json({ 
        error: 'Storage is not set up for this tenant. Please set up storage first.',
        code: 'STORAGE_NOT_SETUP'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in validateStorageSetup middleware:', error);
    
    await logAudit(req, {
      action: AuditAction.SYSTEM_ERROR,
      resource: AuditResource.STORAGE,
      success: false,
      error: 'Failed to validate storage setup',
      severity: AuditSeverity.ERROR,
      metadata: {
        operation: 'validateStorageSetup',
        errorDetails: error instanceof Error ? error.message : String(error)
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'storage_middleware', error_type: 'validation_error' }
    });
    
    return res.status(500).json({ error: 'Failed to validate storage setup' });
  }
};

/**
 * Validate remaining storage quota middleware
 * Works for both single and multiple file uploads
 */
export const validateStorageQuota = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only validate if file(s) present
    if (!req.file && (!req.files || !Array.isArray(req.files))) {
      return next();
    }
    
    const authHeader = req.headers.authorization;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!authHeader) {
      await logAudit(req, {
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'Authorization header is required',
        severity: AuditSeverity.WARNING,
        metadata: {
          operation: 'validateStorageQuota'
        }
      });
      
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    if (!tenantId) {
      await logAudit(req, {
        action: AuditAction.VALIDATION_ERROR,
        resource: AuditResource.STORAGE,
        success: false,
        error: 'x-tenant-id header is required',
        severity: AuditSeverity.WARNING,
        metadata: {
          operation: 'validateStorageQuota'
        }
      });
      
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }
    
    // Import service here to avoid circular dependencies
    const { storageService } = require('../services/storageService');
    
    // Get current storage stats
    const stats = await storageService.getStorageStats(
      authHeader,
      tenantId
    );
    
    // Calculate total size to be uploaded
    let totalUploadSize = 0;
    if (req.file) {
      totalUploadSize = req.file.size;
    } else if (req.files && Array.isArray(req.files)) {
      totalUploadSize = req.files.reduce((sum, file) => sum + file.size, 0);
    }
    
    // Check if tenant has enough quota
    if (totalUploadSize > stats.available) {
      await logAudit(req, {
        action: AuditAction.STORAGE_QUOTA_EXCEEDED,
        resource: AuditResource.STORAGE,
        success: false,
        metadata: {
          operation: 'validateStorageQuota',
          availableSpace: stats.available,
          requiredSpace: totalUploadSize,
          fileCount: req.files ? req.files.length : 1
        },
        severity: AuditSeverity.WARNING
      });
      
      return res.status(400).json({ 
        error: 'Not enough storage space available. Please free up space or upgrade your storage plan.',
        code: 'STORAGE_QUOTA_EXCEEDED',
        availableSpace: stats.available,
        requiredSpace: totalUploadSize
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in validateStorageQuota middleware:', error);
    
    await logAudit(req, {
      action: AuditAction.SYSTEM_ERROR,
      resource: AuditResource.STORAGE,
      success: false,
      error: 'Failed to validate storage quota',
      severity: AuditSeverity.ERROR,
      metadata: {
        operation: 'validateStorageQuota',
        errorDetails: error instanceof Error ? error.message : String(error)
      }
    });
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'storage_middleware', error_type: 'quota_validation_error' }
    });
    
    return res.status(500).json({ error: 'Failed to validate storage quota' });
  }
};

export default {
  handleFileUpload,
  handleMultipleFileUpload,
  validateStorageSetup,
  validateStorageQuota
};