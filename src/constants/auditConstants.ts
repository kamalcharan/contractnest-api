// src/constants/auditConstants.ts
// Centralized audit constants, enums, and types
// Used across the API layer for consistent audit logging

/**
 * Audit action constants - all possible actions that can be audited
 */
export enum AuditAction {
  // ==================
  // Auth Actions (existing)
  // ==================
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  MFA_ENABLE = 'MFA_ENABLE',
  MFA_DISABLE = 'MFA_DISABLE',
  MFA_VERIFY = 'MFA_VERIFY',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  SESSION_EXPIRE = 'SESSION_EXPIRE',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  
  // ==================
  // User Management (existing)
  // ==================
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  USER_SUSPEND = 'USER_SUSPEND',
  USER_ACTIVATE = 'USER_ACTIVATE',
  USER_DEACTIVATE = 'USER_DEACTIVATE',
  ROLE_CHANGE = 'ROLE_CHANGE',
  PERMISSION_GRANT = 'PERMISSION_GRANT',
  PERMISSION_REVOKE = 'PERMISSION_REVOKE',
  USER_INVITE = 'USER_INVITE',
  INVITATION_ACCEPT = 'INVITATION_ACCEPT',
  INVITATION_CANCEL = 'INVITATION_CANCEL',
  INVITATION_RESEND = 'INVITATION_RESEND',
  PROFILE_UPDATE = 'PROFILE_UPDATE',
  PROFILE_VIEW = 'PROFILE_VIEW',
  
  // ==================
  // Onboarding Actions (NEW)
  // ==================
  ONBOARDING_STATUS_VIEW = 'ONBOARDING_STATUS_VIEW',
  ONBOARDING_INITIALIZE = 'ONBOARDING_INITIALIZE',
  ONBOARDING_STEP_COMPLETE = 'ONBOARDING_STEP_COMPLETE',
  ONBOARDING_STEP_SKIP = 'ONBOARDING_STEP_SKIP',
  ONBOARDING_PROGRESS_UPDATE = 'ONBOARDING_PROGRESS_UPDATE',
  ONBOARDING_COMPLETE = 'ONBOARDING_COMPLETE',

  // ==================
  // Storage Actions (existing)
  // ==================
  STORAGE_SETUP = 'STORAGE_SETUP',
  STORAGE_STATS_VIEW = 'STORAGE_STATS_VIEW',
  STORAGE_CATEGORIES_VIEW = 'STORAGE_CATEGORIES_VIEW',
  STORAGE_QUOTA_UPDATE = 'STORAGE_QUOTA_UPDATE',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_DELETE = 'FILE_DELETE',
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  FILE_LIST = 'FILE_LIST',
  FILE_SHARE = 'FILE_SHARE',
  FILE_UNSHARE = 'FILE_UNSHARE',
  FILE_MOVE = 'FILE_MOVE',
  FILE_RENAME = 'FILE_RENAME',
  FILE_RESTORE = 'FILE_RESTORE',
  
  // ==================
  // Admin Storage Actions (existing)
  // ==================
  ADMIN_STORAGE_STRUCTURE_VIEW = 'ADMIN_STORAGE_STRUCTURE_VIEW',
  ADMIN_DIAGNOSTIC_FILES_LIST = 'ADMIN_DIAGNOSTIC_FILES_LIST',
  ADMIN_DIAGNOSTIC_FILE_UPLOAD = 'ADMIN_DIAGNOSTIC_FILE_UPLOAD',
  ADMIN_DIAGNOSTIC_FILE_DELETE = 'ADMIN_DIAGNOSTIC_FILE_DELETE',
  ADMIN_STORAGE_CLEANUP = 'ADMIN_STORAGE_CLEANUP',
  
  // ==================
  // Tenant Actions (existing)
  // ==================
  TENANT_CREATE = 'TENANT_CREATE',
  TENANT_UPDATE = 'TENANT_UPDATE',
  TENANT_DELETE = 'TENANT_DELETE',
  TENANT_SUSPEND = 'TENANT_SUSPEND',
  TENANT_ACTIVATE = 'TENANT_ACTIVATE',
  TENANT_SWITCH = 'TENANT_SWITCH',
  TENANT_SETTINGS_UPDATE = 'TENANT_SETTINGS_UPDATE',
  TENANT_BILLING_UPDATE = 'TENANT_BILLING_UPDATE',
  
  // ==================
  // Tenant Profile Actions (existing)
  // ==================
  TENANT_PROFILE_VIEW = 'TENANT_PROFILE_VIEW',
  TENANT_PROFILE_CREATE = 'TENANT_PROFILE_CREATE',
  TENANT_PROFILE_UPDATE = 'TENANT_PROFILE_UPDATE',
  TENANT_PROFILE_LOGO_UPLOAD = 'TENANT_PROFILE_LOGO_UPLOAD',
  
  // ==================
  // Catalog Management Actions (NEW)
  // ==================
  // Industries
  CATALOG_INDUSTRY_VIEW = 'CATALOG_INDUSTRY_VIEW',
  CATALOG_INDUSTRY_LIST = 'CATALOG_INDUSTRY_LIST',
  CATALOG_INDUSTRY_CREATE = 'CATALOG_INDUSTRY_CREATE',
  CATALOG_INDUSTRY_UPDATE = 'CATALOG_INDUSTRY_UPDATE',
  CATALOG_INDUSTRY_DELETE = 'CATALOG_INDUSTRY_DELETE',
  CATALOG_INDUSTRY_ACTIVATE = 'CATALOG_INDUSTRY_ACTIVATE',
  CATALOG_INDUSTRY_DEACTIVATE = 'CATALOG_INDUSTRY_DEACTIVATE',
  
  // Categories
  CATALOG_CATEGORY_VIEW = 'CATALOG_CATEGORY_VIEW',
  CATALOG_CATEGORY_LIST = 'CATALOG_CATEGORY_LIST',
  CATALOG_CATEGORY_CREATE = 'CATALOG_CATEGORY_CREATE',
  CATALOG_CATEGORY_UPDATE = 'CATALOG_CATEGORY_UPDATE',
  CATALOG_CATEGORY_DELETE = 'CATALOG_CATEGORY_DELETE',
  CATALOG_CATEGORY_ACTIVATE = 'CATALOG_CATEGORY_ACTIVATE',
  CATALOG_CATEGORY_DEACTIVATE = 'CATALOG_CATEGORY_DEACTIVATE',
  
  // Catalog Items (Core Functionality)
  CATALOG_ITEM_CREATE = 'CATALOG_ITEM_CREATE',
  CATALOG_ITEM_VIEW = 'CATALOG_ITEM_VIEW',
  CATALOG_ITEM_LIST = 'CATALOG_ITEM_LIST',
  CATALOG_ITEM_UPDATE = 'CATALOG_ITEM_UPDATE',
  CATALOG_ITEM_DELETE = 'CATALOG_ITEM_DELETE',
  CATALOG_ITEM_COPY = 'CATALOG_ITEM_COPY',
  CATALOG_ITEM_ACTIVATE = 'CATALOG_ITEM_ACTIVATE',
  CATALOG_ITEM_DEACTIVATE = 'CATALOG_ITEM_DEACTIVATE',
  CATALOG_ITEM_SEARCH = 'CATALOG_ITEM_SEARCH',
  CATALOG_ITEM_EXPORT = 'CATALOG_ITEM_EXPORT',
  CATALOG_ITEM_IMPORT = 'CATALOG_ITEM_IMPORT',
  
  // Catalog Item Versions
  CATALOG_ITEM_VERSION_CREATE = 'CATALOG_ITEM_VERSION_CREATE',
  CATALOG_ITEM_VERSION_VIEW = 'CATALOG_ITEM_VERSION_VIEW',
  CATALOG_ITEM_VERSION_LIST = 'CATALOG_ITEM_VERSION_LIST',
  CATALOG_ITEM_VERSION_RESTORE = 'CATALOG_ITEM_VERSION_RESTORE',
  CATALOG_ITEM_VERSION_COMPARE = 'CATALOG_ITEM_VERSION_COMPARE',
  
  // Pricing Operations
  CATALOG_PRICING_UPDATE = 'CATALOG_PRICING_UPDATE',
  CATALOG_PRICING_RULE_CREATE = 'CATALOG_PRICING_RULE_CREATE',
  CATALOG_PRICING_RULE_UPDATE = 'CATALOG_PRICING_RULE_UPDATE',
  CATALOG_PRICING_RULE_DELETE = 'CATALOG_PRICING_RULE_DELETE',
  CATALOG_DYNAMIC_PRICING_UPDATE = 'CATALOG_DYNAMIC_PRICING_UPDATE',
  CATALOG_PACKAGE_PRICING_UPDATE = 'CATALOG_PACKAGE_PRICING_UPDATE',
  CATALOG_BULK_PRICING_UPDATE = 'CATALOG_BULK_PRICING_UPDATE',
  
  // Variants and Service Hierarchy
  CATALOG_VARIANT_CREATE = 'CATALOG_VARIANT_CREATE',
  CATALOG_VARIANT_UPDATE = 'CATALOG_VARIANT_UPDATE',
  CATALOG_VARIANT_DELETE = 'CATALOG_VARIANT_DELETE',
  CATALOG_SERVICE_HIERARCHY_UPDATE = 'CATALOG_SERVICE_HIERARCHY_UPDATE',
  
  // Bulk Operations
  CATALOG_BULK_CREATE = 'CATALOG_BULK_CREATE',
  CATALOG_BULK_UPDATE = 'CATALOG_BULK_UPDATE',
  CATALOG_BULK_DELETE = 'CATALOG_BULK_DELETE',
  CATALOG_BULK_ACTIVATE = 'CATALOG_BULK_ACTIVATE',
  CATALOG_BULK_DEACTIVATE = 'CATALOG_BULK_DEACTIVATE',
  
  // AI and Smart Features
  CATALOG_AI_SUGGESTION_VIEW = 'CATALOG_AI_SUGGESTION_VIEW',
  CATALOG_AI_SUGGESTION_APPLY = 'CATALOG_AI_SUGGESTION_APPLY',
  CATALOG_SMART_CATEGORIZATION = 'CATALOG_SMART_CATEGORIZATION',
  CATALOG_PRICE_RECOMMENDATION = 'CATALOG_PRICE_RECOMMENDATION',
  
  // Validation and Business Rules
  CATALOG_VALIDATION_RUN = 'CATALOG_VALIDATION_RUN',
  CATALOG_BUSINESS_RULE_VIOLATION = 'CATALOG_BUSINESS_RULE_VIOLATION',
  CATALOG_CONSISTENCY_CHECK = 'CATALOG_CONSISTENCY_CHECK',
  
  // ==================
  // Integration Actions (existing)
  // ==================
  INTEGRATION_CONNECT = 'INTEGRATION_CONNECT',
  INTEGRATION_DISCONNECT = 'INTEGRATION_DISCONNECT',
  INTEGRATION_UPDATE = 'INTEGRATION_UPDATE',
  INTEGRATION_SYNC = 'INTEGRATION_SYNC',
  INTEGRATION_ERROR = 'INTEGRATION_ERROR',
  API_KEY_CREATE = 'API_KEY_CREATE',
  API_KEY_DELETE = 'API_KEY_DELETE',
  API_KEY_REGENERATE = 'API_KEY_REGENERATE',
  WEBHOOK_CREATE = 'WEBHOOK_CREATE',
  WEBHOOK_UPDATE = 'WEBHOOK_UPDATE',
  WEBHOOK_DELETE = 'WEBHOOK_DELETE',
  WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
  WEBHOOK_FAILED = 'WEBHOOK_FAILED',
  
  // ==================
  // Master Data Actions (existing)
  // ==================
  MASTERDATA_CATEGORY_VIEW = 'MASTERDATA_CATEGORY_VIEW',
  MASTERDATA_CATEGORY_CREATE = 'MASTERDATA_CATEGORY_CREATE',
  MASTERDATA_CATEGORY_UPDATE = 'MASTERDATA_CATEGORY_UPDATE',
  MASTERDATA_CATEGORY_DELETE = 'MASTERDATA_CATEGORY_DELETE',
  MASTERDATA_DETAIL_VIEW = 'MASTERDATA_DETAIL_VIEW',
  MASTERDATA_DETAIL_CREATE = 'MASTERDATA_DETAIL_CREATE',
  MASTERDATA_DETAIL_UPDATE = 'MASTERDATA_DETAIL_UPDATE',
  MASTERDATA_DETAIL_DELETE = 'MASTERDATA_DETAIL_DELETE',
  MASTERDATA_SEQUENCE_GET = 'MASTERDATA_SEQUENCE_GET',
  
  // ==================
  // Tax Management Actions (NEW - for tax functionality)
  // ==================
  TAX_SETTINGS_VIEW = 'TAX_SETTINGS_VIEW',
  TAX_SETTINGS_CREATE = 'TAX_SETTINGS_CREATE',
  TAX_SETTINGS_UPDATE = 'TAX_SETTINGS_UPDATE',
  TAX_RATE_CREATE = 'TAX_RATE_CREATE',
  TAX_RATE_UPDATE = 'TAX_RATE_UPDATE',
  TAX_RATE_DELETE = 'TAX_RATE_DELETE',
  TAX_RATE_VIEW = 'TAX_RATE_VIEW',
  TAX_RATE_LIST = 'TAX_RATE_LIST',
  TAX_RATE_ACTIVATE = 'TAX_RATE_ACTIVATE',
  TAX_RATE_DEACTIVATE = 'TAX_RATE_DEACTIVATE',
  TAX_DEFAULT_CHANGE = 'TAX_DEFAULT_CHANGE',
  TAX_DISPLAY_MODE_CHANGE = 'TAX_DISPLAY_MODE_CHANGE',
  TAX_SEQUENCE_UPDATE = 'TAX_SEQUENCE_UPDATE',
  
  // ==================
  // Security Actions (existing)
  // ==================
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  SECURITY_ALERT = 'SECURITY_ALERT',
  IP_BLOCKED = 'IP_BLOCKED',
  IP_UNBLOCKED = 'IP_UNBLOCKED',
  
  // ==================
  // System Actions (existing)
  // ==================
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  SYSTEM_WARNING = 'SYSTEM_WARNING',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
  BACKUP_CREATED = 'BACKUP_CREATED',
  BACKUP_RESTORED = 'BACKUP_RESTORED',
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_IMPORT = 'DATA_IMPORT',
  CACHE_CLEAR = 'CACHE_CLEAR',
  DATABASE_MIGRATION = 'DATABASE_MIGRATION',
  FIREBASE_STATUS_CHECK = 'FIREBASE_STATUS_CHECK',
  SERVICE_HEALTH_CHECK = 'SERVICE_HEALTH_CHECK',
  REQUEST_ERROR = 'REQUEST_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  
  // ==================
  // Audit System Actions (existing)
  // ==================
  AUDIT_LOG_QUERY = 'AUDIT_LOG_QUERY',
  AUDIT_LOG_EXPORT = 'AUDIT_LOG_EXPORT',
  AUDIT_STATS_VIEW = 'AUDIT_STATS_VIEW',
  AUDIT_LOG_SEARCH = 'AUDIT_LOG_SEARCH',
  
  // ==================
  // Custom/Generic Actions (existing)
  // ==================
  CUSTOM_ACTION = 'CUSTOM_ACTION',
  PAGE_VIEW = 'PAGE_VIEW',
}

/**
 * Audit resource types - the type of resource being acted upon
 */
export enum AuditResource {
  AUTH = 'auth',
  USERS = 'users',
  STORAGE = 'storage',
  TENANTS = 'tenants',
  TENANT_PROFILE = 'tenant_profile',
  INTEGRATIONS = 'integrations',
  WEBHOOKS = 'webhooks',
  SYSTEM = 'system',
  AUDIT = 'audit',
  API_KEYS = 'api_keys',
  SETTINGS = 'settings',
  NOTIFICATIONS = 'notifications',
  REPORTS = 'reports',
  MASTERDATA = 'masterdata',
  ONBOARDING = 'onboarding',
  
  // Tax Resources (NEW - for tax functionality)
  TAX_SETTINGS = 'tax_settings',
  TAX_RATES = 'tax_rates',
  
  // Catalog Resources (NEW - for catalog functionality)
  CATALOG = 'catalog',
  CATALOG_ITEMS = 'catalog_items',
  CATALOG_INDUSTRIES = 'catalog_industries',
  CATALOG_CATEGORIES = 'catalog_categories',
  CATALOG_VARIANTS = 'catalog_variants',
  CATALOG_PRICING = 'catalog_pricing',
  CATALOG_VERSIONS = 'catalog_versions',
  
  CUSTOM = 'custom'
}

/**
 * Audit severity levels - the importance/severity of the audit event
 */
export enum AuditSeverity {
  INFO = 'info',      // Informational events (normal operations)
  WARNING = 'warning', // Warning events (potential issues, admin actions)
  ERROR = 'error',    // Error events (failures, exceptions)
  CRITICAL = 'critical' // Critical events (security issues, data loss risks)
}

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  action: AuditAction | string;
  resource: AuditResource | string;
  resourceId?: string;
  metadata?: Record<string, any>;
  success?: boolean;
  error?: string;
  severity?: AuditSeverity;
  correlationId?: string;
}

/**
 * Audit context interface - information about who/where the action is happening
 */
export interface AuditContext {
  tenantId: string;
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  allTenantIds?: string[];
  isSuperAdmin?: boolean;
  isTenantAdmin?: boolean;
}

/**
 * Query filters interface for searching audit logs
 */
export interface AuditQueryFilters {
  tenantId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  severity?: AuditSeverity;
  success?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'action' | 'resource' | 'severity';
  orderDirection?: 'asc' | 'desc';
  searchTerm?: string;
  correlationId?: string;
  sessionId?: string;
}

/**
 * Audit statistics interface
 */
export interface AuditStatistics {
  totalLogs: number;
  actionCounts: Record<string, number>;
  severityCounts: Record<string, number>;
  resourceCounts: Record<string, number>;
  successRate: number;
  errorRate: number;
  topUsers: Array<{ userId: string; userEmail?: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
  timeRange: {
    start: Date;
    end: Date;
  };
  hourlyDistribution?: Record<string, number>;
  dailyDistribution?: Record<string, number>;
}

/**
 * Audit export options
 */
export interface AuditExportOptions {
  format: 'csv' | 'json' | 'xlsx';
  includeMetadata?: boolean;
  fields?: string[];
  dateFormat?: string;
}

/**
 * Helper functions for audit severity determination
 */
export const getDefaultSeverity = (action: AuditAction): AuditSeverity => {
  // Critical severity actions
  const criticalActions: AuditAction[] = [
    AuditAction.SYSTEM_ERROR,
    AuditAction.SECURITY_ALERT,
    AuditAction.DATA_EXPORT,
    AuditAction.USER_DELETE,
    AuditAction.TENANT_DELETE,
    AuditAction.BACKUP_RESTORED,
    AuditAction.TAX_RATE_DELETE, // Tax deletion is critical for compliance
    AuditAction.CATALOG_ITEM_DELETE, // Catalog deletion
    AuditAction.CATALOG_BULK_DELETE, // Bulk deletions
    AuditAction.CATALOG_INDUSTRY_DELETE,
    AuditAction.CATALOG_CATEGORY_DELETE,
  ];
  
  // Warning severity actions
  const warningActions: AuditAction[] = [
    AuditAction.UNAUTHORIZED_ACCESS,
    AuditAction.RATE_LIMIT_EXCEEDED,
    AuditAction.SUSPICIOUS_ACTIVITY,
    AuditAction.STORAGE_QUOTA_EXCEEDED,
    AuditAction.USER_SUSPEND,
    AuditAction.TENANT_SUSPEND,
    AuditAction.ROLE_CHANGE,
    AuditAction.PERMISSION_GRANT,
    AuditAction.PERMISSION_REVOKE,
    AuditAction.INTEGRATION_ERROR,
    AuditAction.WEBHOOK_FAILED,
    AuditAction.TAX_DEFAULT_CHANGE,     // Important for pricing
    AuditAction.TAX_DISPLAY_MODE_CHANGE, // Important for pricing
    AuditAction.TAX_SETTINGS_UPDATE,    // Important configuration change
    AuditAction.MASTERDATA_DETAIL_DELETE,
    AuditAction.TENANT_PROFILE_UPDATE,
    // Catalog warning actions
    AuditAction.CATALOG_PRICING_UPDATE, // Pricing changes are important
    AuditAction.CATALOG_BULK_UPDATE,    // Bulk operations need attention
    AuditAction.CATALOG_DYNAMIC_PRICING_UPDATE,
    AuditAction.CATALOG_BUSINESS_RULE_VIOLATION,
    AuditAction.CATALOG_AI_SUGGESTION_APPLY, // AI changes should be monitored
    AuditAction.CATALOG_BULK_PRICING_UPDATE,
    AuditAction.CATALOG_SERVICE_HIERARCHY_UPDATE,
  ];
  
  // Error severity actions
  const errorActions: AuditAction[] = [
    AuditAction.INVALID_SIGNATURE,
    AuditAction.REQUEST_ERROR,
    AuditAction.VALIDATION_ERROR,
    AuditAction.BUSINESS_RULE_VIOLATION,
  ];
  
  if (criticalActions.includes(action)) return AuditSeverity.CRITICAL;
  if (warningActions.includes(action)) return AuditSeverity.WARNING;
  if (errorActions.includes(action)) return AuditSeverity.ERROR;
  
  return AuditSeverity.INFO;
};

/**
 * Helper to determine if an action should be alerted on
 */
export const shouldAlert = (action: AuditAction, severity: AuditSeverity): boolean => {
  // Always alert on critical
  if (severity === AuditSeverity.CRITICAL) return true;
  
  // Alert on specific warning actions
  const alertableWarnings: AuditAction[] = [
    AuditAction.UNAUTHORIZED_ACCESS,
    AuditAction.SUSPICIOUS_ACTIVITY,
    AuditAction.USER_DELETE,
    AuditAction.TENANT_DELETE,
    AuditAction.DATA_EXPORT,
    AuditAction.TAX_RATE_DELETE,      // Critical for compliance
    AuditAction.TAX_DEFAULT_CHANGE,   // Important pricing change
    AuditAction.MASTERDATA_DETAIL_DELETE,
    // Catalog alertable actions
    AuditAction.CATALOG_ITEM_DELETE,
    AuditAction.CATALOG_BULK_DELETE,
    AuditAction.CATALOG_BULK_PRICING_UPDATE,
    AuditAction.CATALOG_INDUSTRY_DELETE,
    AuditAction.CATALOG_CATEGORY_DELETE,
    AuditAction.CATALOG_BUSINESS_RULE_VIOLATION,
  ];
  
  return severity === AuditSeverity.WARNING && alertableWarnings.includes(action);
};

/**
 * Action groups for categorization
 */
export const ActionGroups = {
  AUTH: [
    AuditAction.LOGIN,
    AuditAction.LOGOUT,
    AuditAction.PASSWORD_CHANGE,
    AuditAction.PASSWORD_RESET,
    AuditAction.MFA_ENABLE,
    AuditAction.MFA_DISABLE,
    AuditAction.TOKEN_REFRESH
  ],
  USER_MANAGEMENT: [
    AuditAction.USER_CREATE,
    AuditAction.USER_UPDATE,
    AuditAction.USER_DELETE,
    AuditAction.USER_SUSPEND,
    AuditAction.USER_ACTIVATE,
    AuditAction.ROLE_CHANGE,
    AuditAction.USER_INVITE
  ],
  ONBOARDING: [
    AuditAction.ONBOARDING_STATUS_VIEW,
    AuditAction.ONBOARDING_INITIALIZE,
    AuditAction.ONBOARDING_STEP_COMPLETE,
    AuditAction.ONBOARDING_STEP_SKIP,
    AuditAction.ONBOARDING_PROGRESS_UPDATE,
    AuditAction.ONBOARDING_COMPLETE
  ],
  STORAGE: [
    AuditAction.STORAGE_SETUP,
    AuditAction.FILE_UPLOAD,
    AuditAction.FILE_DELETE,
    AuditAction.FILE_DOWNLOAD,
    AuditAction.FILE_LIST
  ],
  TENANT_MANAGEMENT: [
    AuditAction.TENANT_CREATE,
    AuditAction.TENANT_UPDATE,
    AuditAction.TENANT_DELETE,
    AuditAction.TENANT_PROFILE_VIEW,
    AuditAction.TENANT_PROFILE_CREATE,
    AuditAction.TENANT_PROFILE_UPDATE,
    AuditAction.TENANT_PROFILE_LOGO_UPLOAD
  ],
  INTEGRATIONS: [
    AuditAction.INTEGRATION_CONNECT,
    AuditAction.INTEGRATION_DISCONNECT,
    AuditAction.INTEGRATION_UPDATE,
    AuditAction.API_KEY_CREATE,
    AuditAction.WEBHOOK_CREATE
  ],
  MASTER_DATA: [
    AuditAction.MASTERDATA_CATEGORY_VIEW,
    AuditAction.MASTERDATA_CATEGORY_CREATE,
    AuditAction.MASTERDATA_CATEGORY_UPDATE,
    AuditAction.MASTERDATA_CATEGORY_DELETE,
    AuditAction.MASTERDATA_DETAIL_VIEW,
    AuditAction.MASTERDATA_DETAIL_CREATE,
    AuditAction.MASTERDATA_DETAIL_UPDATE,
    AuditAction.MASTERDATA_DETAIL_DELETE,
    AuditAction.MASTERDATA_SEQUENCE_GET
  ],
  // Tax Management Group (NEW)
  TAX_MANAGEMENT: [
    AuditAction.TAX_SETTINGS_VIEW,
    AuditAction.TAX_SETTINGS_CREATE,
    AuditAction.TAX_SETTINGS_UPDATE,
    AuditAction.TAX_RATE_CREATE,
    AuditAction.TAX_RATE_UPDATE,
    AuditAction.TAX_RATE_DELETE,
    AuditAction.TAX_RATE_VIEW,
    AuditAction.TAX_RATE_LIST,
    AuditAction.TAX_RATE_ACTIVATE,
    AuditAction.TAX_RATE_DEACTIVATE,
    AuditAction.TAX_DEFAULT_CHANGE,
    AuditAction.TAX_DISPLAY_MODE_CHANGE,
    AuditAction.TAX_SEQUENCE_UPDATE
  ],
  // Catalog Management Group (NEW)
  CATALOG_MANAGEMENT: [
    // Core catalog items
    AuditAction.CATALOG_ITEM_CREATE,
    AuditAction.CATALOG_ITEM_VIEW,
    AuditAction.CATALOG_ITEM_LIST,
    AuditAction.CATALOG_ITEM_UPDATE,
    AuditAction.CATALOG_ITEM_DELETE,
    AuditAction.CATALOG_ITEM_COPY,
    AuditAction.CATALOG_ITEM_SEARCH,
    AuditAction.CATALOG_ITEM_EXPORT,
    AuditAction.CATALOG_ITEM_IMPORT,
    
    // Industries and categories
    AuditAction.CATALOG_INDUSTRY_VIEW,
    AuditAction.CATALOG_INDUSTRY_LIST,
    AuditAction.CATALOG_INDUSTRY_CREATE,
    AuditAction.CATALOG_INDUSTRY_UPDATE,
    AuditAction.CATALOG_INDUSTRY_DELETE,
    AuditAction.CATALOG_CATEGORY_VIEW,
    AuditAction.CATALOG_CATEGORY_LIST,
    AuditAction.CATALOG_CATEGORY_CREATE,
    AuditAction.CATALOG_CATEGORY_UPDATE,
    AuditAction.CATALOG_CATEGORY_DELETE,
    
    // Versions
    AuditAction.CATALOG_ITEM_VERSION_CREATE,
    AuditAction.CATALOG_ITEM_VERSION_VIEW,
    AuditAction.CATALOG_ITEM_VERSION_LIST,
    AuditAction.CATALOG_ITEM_VERSION_RESTORE,
    AuditAction.CATALOG_ITEM_VERSION_COMPARE,
    
    // Variants and hierarchy
    AuditAction.CATALOG_VARIANT_CREATE,
    AuditAction.CATALOG_VARIANT_UPDATE,
    AuditAction.CATALOG_VARIANT_DELETE,
    AuditAction.CATALOG_SERVICE_HIERARCHY_UPDATE
  ],
  CATALOG_PRICING: [
    AuditAction.CATALOG_PRICING_UPDATE,
    AuditAction.CATALOG_PRICING_RULE_CREATE,
    AuditAction.CATALOG_PRICING_RULE_UPDATE,
    AuditAction.CATALOG_PRICING_RULE_DELETE,
    AuditAction.CATALOG_DYNAMIC_PRICING_UPDATE,
    AuditAction.CATALOG_PACKAGE_PRICING_UPDATE,
    AuditAction.CATALOG_BULK_PRICING_UPDATE,
    AuditAction.CATALOG_PRICE_RECOMMENDATION
  ],
  CATALOG_BULK_OPERATIONS: [
    AuditAction.CATALOG_BULK_CREATE,
    AuditAction.CATALOG_BULK_UPDATE,
    AuditAction.CATALOG_BULK_DELETE,
    AuditAction.CATALOG_BULK_ACTIVATE,
    AuditAction.CATALOG_BULK_DEACTIVATE
  ],
  CATALOG_AI_FEATURES: [
    AuditAction.CATALOG_AI_SUGGESTION_VIEW,
    AuditAction.CATALOG_AI_SUGGESTION_APPLY,
    AuditAction.CATALOG_SMART_CATEGORIZATION,
    AuditAction.CATALOG_PRICE_RECOMMENDATION
  ],
  CATALOG_VALIDATION: [
    AuditAction.CATALOG_VALIDATION_RUN,
    AuditAction.CATALOG_BUSINESS_RULE_VIOLATION,
    AuditAction.CATALOG_CONSISTENCY_CHECK
  ],
  SECURITY: [
    AuditAction.UNAUTHORIZED_ACCESS,
    AuditAction.RATE_LIMIT_EXCEEDED,
    AuditAction.SUSPICIOUS_ACTIVITY,
    AuditAction.SECURITY_ALERT
  ]
};

/**
 * Export all constants for easy importing
 */
export default {
  AuditAction,
  AuditResource,
  AuditSeverity,
  getDefaultSeverity,
  shouldAlert,
  ActionGroups
};