// src/validators/storageValidation.ts
// Storage validation middleware for Express routes
// Implements comprehensive validation for file operations with security checks

import { Request, Response, NextFunction } from 'express';
import { storageService } from '../services/storageService';
import { StorageFile, PaginatedFilesResponse } from '../types/storage';

// Define storage category types locally for validation
interface StorageCategory {
  id: string;
  name: string;
  allowedTypes: string[];
}

// Define the categories directly in this file since we can't import from UI layer
const STORAGE_CATEGORIES: StorageCategory[] = [
  {
    id: 'contact_photos',
    name: 'Contact Photos',
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif']
  },
  {
    id: 'contract_media',
    name: 'Contract Media',
    allowedTypes: [
      'image/jpeg', 
      'image/png', 
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  },
  {
    id: 'service_images',
    name: 'Service Images',
    allowedTypes: ['image/jpeg', 'image/png', 'image/svg+xml']
  },
  {
    id: 'documents',
    name: 'Documents',
    allowedTypes: [
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
      'text/plain'
    ]
  }
];

/**
 * Validate tenant has storage setup
 */
export const validateStorageSetup = async (req: Request, res: Response, next: NextFunction) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID is required' });
  }
  
  try {
    const isSetup = await storageService.isStorageSetupComplete(
      req.headers.authorization as string,
      tenantId
    );
    
    if (!isSetup) {
      return res.status(400).json({ 
        error: 'Storage is not set up for this tenant', 
        code: 'STORAGE_NOT_SETUP'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error validating storage setup:', error);
    return res.status(500).json({ error: 'Failed to validate storage setup' });
  }
};

/**
 * Check if file type is allowed for a category
 */
const isFileTypeAllowed = (fileType: string, categoryId: string): boolean => {
  const category = STORAGE_CATEGORIES.find((cat: StorageCategory) => cat.id === categoryId);
  return category ? category.allowedTypes.includes(fileType) : false;
};

/**
 * Validate file upload request
 */
export const validateFileUpload = (req: Request, res: Response, next: NextFunction) => {
  // Check if file exists
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }
  
  // Check file size (5MB max)
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  if (req.file.size > MAX_FILE_SIZE) {
    return res.status(400).json({ 
      error: `File size exceeds the maximum limit of 5MB`,
      code: 'FILE_TOO_LARGE'
    });
  }
  
  // Check category
  if (!req.body.category) {
    return res.status(400).json({ error: 'Category is required' });
  }
  
  // Validate category
  const validCategories = STORAGE_CATEGORIES.map((cat: StorageCategory) => cat.id);
  if (!validCategories.includes(req.body.category)) {
    return res.status(400).json({ 
      error: `Invalid category. Must be one of: ${validCategories.join(', ')}`, 
      code: 'INVALID_CATEGORY'
    });
  }
  
  // Validate file type for the category
  const fileType = req.file.mimetype;
  const isValidType = isFileTypeAllowed(fileType, req.body.category);
  
  if (!isValidType) {
    return res.status(400).json({ 
      error: 'File type not allowed for the selected category',
      code: 'INVALID_FILE_TYPE' 
    });
  }
  
  next();
};

/**
 * Validate multiple file upload request
 */
export const validateMultipleFileUpload = (req: Request, res: Response, next: NextFunction) => {
  // Check if files exist
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }
  
  // Check file count limit (e.g., max 10 files at once)
  const MAX_FILE_COUNT = 10;
  if (req.files.length > MAX_FILE_COUNT) {
    return res.status(400).json({ 
      error: `Cannot upload more than ${MAX_FILE_COUNT} files at once`,
      code: 'TOO_MANY_FILES'
    });
  }
  
  // Check total size
  const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB total
  const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return res.status(400).json({ 
      error: `Total file size exceeds the maximum limit of 20MB`,
      code: 'TOTAL_SIZE_TOO_LARGE'
    });
  }
  
  // Validate each file
  const errors: any[] = [];
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  
  req.files.forEach((file: Express.Multer.File, index: number) => {
    // Check individual file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push({
        file: file.originalname,
        index,
        error: 'File size exceeds 5MB limit'
      });
    }
    
    // Check if category is provided for this file
    const category = req.body.categories?.[index] || req.body.category;
    if (!category) {
      errors.push({
        file: file.originalname,
        index,
        error: 'Category is required'
      });
      return;
    }
    
    // Validate category
    const validCategories = STORAGE_CATEGORIES.map((cat: StorageCategory) => cat.id);
    if (!validCategories.includes(category)) {
      errors.push({
        file: file.originalname,
        index,
        error: `Invalid category: ${category}`
      });
      return;
    }
    
    // Validate file type
    const isValidType = isFileTypeAllowed(file.mimetype, category);
    if (!isValidType) {
      errors.push({
        file: file.originalname,
        index,
        error: 'File type not allowed for the selected category'
      });
    }
  });
  
  if (errors.length > 0) {
    return res.status(400).json({ 
      error: 'Validation failed for some files',
      code: 'VALIDATION_FAILED',
      details: errors
    });
  }
  
  next();
};

/**
 * Validate storage quota
 */
export const validateStorageQuota = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.file && (!req.files || !Array.isArray(req.files))) {
    return next(); // No file to validate quota for
  }
  
  const tenantId = req.headers['x-tenant-id'] as string;
  
  try {
    const stats = await storageService.getStorageStats(
      req.headers.authorization as string,
      tenantId
    );
    
    // Calculate total size to be uploaded
    let totalUploadSize = 0;
    if (req.file) {
      totalUploadSize = req.file.size;
    } else if (req.files && Array.isArray(req.files)) {
      totalUploadSize = req.files.reduce((sum, file) => sum + file.size, 0);
    }
    
    if (totalUploadSize > stats.available) {
      return res.status(400).json({
        error: 'Not enough storage space available',
        available: stats.available,
        required: totalUploadSize,
        code: 'STORAGE_QUOTA_EXCEEDED'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error validating storage quota:', error);
    return res.status(500).json({ error: 'Failed to validate storage quota' });
  }
};

/**
 * Verify file ownership
 */
const verifyFileOwnership = async (authToken: string, tenantId: string, fileId: string): Promise<boolean> => {
  try {
    // Get files from the service
    const result = await storageService.listFiles(authToken, tenantId);
    
    // Handle both array and paginated response
    let files: StorageFile[];
    if (Array.isArray(result)) {
      files = result;
    } else {
      // It's a PaginatedFilesResponse
      files = (result as PaginatedFilesResponse).files;
    }
    
    return files.some((file: StorageFile) => file.id === fileId);
  } catch (error) {
    console.error('Error verifying file ownership:', error);
    return false;
  }
};

/**
 * Validate file operation permissions
 */
export const validateFilePermission = async (req: Request, res: Response, next: NextFunction) => {
  const tenantId = req.headers['x-tenant-id'] as string;
  const fileId = req.params.fileId;
  
  if (!fileId) {
    return res.status(400).json({ error: 'File ID is required' });
  }
  
  try {
    const fileExists = await verifyFileOwnership(
      req.headers.authorization as string,
      tenantId,
      fileId
    );
    
    if (!fileExists) {
      return res.status(404).json({
        error: 'File not found or you do not have permission to access it',
        code: 'FILE_NOT_FOUND'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error validating file permission:', error);
    return res.status(500).json({ error: 'Failed to validate file permission' });
  }
};

/**
 * Validate batch delete request
 */
export const validateBatchDelete = (req: Request, res: Response, next: NextFunction) => {
  const { fileIds } = req.body;
  
  if (!fileIds || !Array.isArray(fileIds)) {
    return res.status(400).json({ 
      error: 'fileIds must be an array',
      code: 'INVALID_REQUEST'
    });
  }
  
  if (fileIds.length === 0) {
    return res.status(400).json({ 
      error: 'No files specified for deletion',
      code: 'EMPTY_REQUEST'
    });
  }
  
  // Limit batch size
  const MAX_BATCH_SIZE = 50;
  if (fileIds.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ 
      error: `Cannot delete more than ${MAX_BATCH_SIZE} files at once`,
      code: 'BATCH_TOO_LARGE'
    });
  }
  
  // Validate each file ID format (assuming UUIDs)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const invalidIds = fileIds.filter(id => !uuidRegex.test(id));
  
  if (invalidIds.length > 0) {
    return res.status(400).json({ 
      error: 'Invalid file ID format',
      code: 'INVALID_FILE_ID',
      invalidIds
    });
  }
  
  next();
};

export default {
  validateStorageSetup,
  validateFileUpload,
  validateMultipleFileUpload,
  validateStorageQuota,
  validateFilePermission,
  validateBatchDelete
};