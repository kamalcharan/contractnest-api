// src/types/storage.ts
// Type definitions for storage functionality
// Includes support for multiple file operations and enhanced metadata

export interface StorageCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  allowedTypes: string[];
  path: string;
}

export interface StorageStats {
  storageSetupComplete: boolean;
  quota: number; // In bytes
  used: number; // In bytes
  available: number; // In bytes
  usagePercentage: number; // 0-100
  totalFiles: number;
  categories: CategoryStats[];
}

export interface CategoryStats {
  id: string;
  name: string;
  count: number;
}

export interface StorageFile {
  id: string;
  tenant_id: string;
  file_name: string;
  file_path: string;
  file_size: number; // In bytes
  file_type: string; // File extension (pdf, jpg, etc.)
  file_category: string; // 'contact_photos', 'contract_media', etc.
  mime_type: string; // Full MIME type
  download_url: string;
  created_at: string;
  updated_at: string;
  created_by?: string; // Optional reference to user who uploaded
  metadata?: Record<string, any>; // Optional metadata
}

export interface FileUploadResponse {
  file: StorageFile;
  storageStats?: StorageStats;
}

export interface FileDeleteResponse {
  success: boolean;
  message: string;
  fileId?: string;
  storageStats?: StorageStats;
}

export interface StorageSetupResponse {
  storageSetupComplete: boolean;
  quota: number; // In bytes
  used: number; // In bytes
  available: number; // In bytes
  usagePercentage: number; // 0-100
  path: string;
}

export interface FileUploadRequest {
  file: Express.Multer.File;
  category: string;
  tenantId: string;
  metadata?: Record<string, any>;
}

export interface MultipleFileUploadRequest {
  files: Express.Multer.File[];
  categories?: string[]; // One per file
  category?: string; // Default for all files
  tenantId: string;
  metadata?: Record<string, any>[]; // One per file
}

export interface PaginatedFilesResponse {
  files: StorageFile[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface BatchOperationResult<T> {
  results: T[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

export interface FileUploadResult {
  file?: StorageFile;
  error?: string;
  fileName: string;
}

export interface FileDeleteResult {
  success: boolean;
  fileId: string;
  error?: string;
}

export interface MultipleFileUploadResponse extends BatchOperationResult<FileUploadResult> {
  message: string;
}

export interface MultipleFileDeleteResponse extends BatchOperationResult<FileDeleteResult> {
  message: string;
}

export interface StorageQuotaUpdateRequest {
  newQuota: number; // In MB
}

export interface StorageQuotaUpdateResponse {
  success: boolean;
  oldQuota: number; // In MB
  newQuota: number; // In MB
  storageStats: StorageStats;
}

export interface StorageError {
  error: {
    message: string;
    code: string;
    timestamp: string;
  };
}

export interface RateLimitError extends StorageError {
  retryAfter?: number; // Seconds
}

// Audit log types for storage operations
export interface StorageAuditLog {
  id: string;
  tenant_id: string;
  user_id?: string;
  action: StorageAuditAction;
  resource: 'storage';
  resource_id?: string;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    category?: string;
    oldValue?: any;
    newValue?: any;
  };
  ip_address: string;
  user_agent: string;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export type StorageAuditAction = 
  | 'STORAGE_SETUP'
  | 'FILE_UPLOAD'
  | 'FILE_DELETE'
  | 'FILE_DOWNLOAD'
  | 'STORAGE_QUOTA_UPDATE'
  | 'INVALID_SIGNATURE'
  | 'RATE_LIMIT_EXCEEDED';

// Request signing types
export interface SignedRequestHeaders {
  'Authorization': string;
  'x-tenant-id': string;
  'x-request-id': string;
  'x-timestamp': string;
  'x-signature'?: string;
  'x-idempotency-key'?: string;
  'Content-Type'?: string;
}

// File validation types
export interface FileValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface StorageOperationContext {
  tenantId: string;
  userId?: string;
  requestId: string;
  timestamp: number;
  operation: string;
}