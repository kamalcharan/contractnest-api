// src/constants/auditConstants.ts
// Centralized audit constants, enums, and types
// Used across the application for consistent audit logging

/**
 * Audit action constants - all possible actions that can be audited
 */
export enum AuditAction {
  // ==================
  // Auth Actions
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
  
  // ==================
  // User Management
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
  // Storage Actions
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
  // Admin Storage Actions
  // ==================
  ADMIN_STORAGE_STRUCTURE_VIEW = 'ADMIN_STORAGE_STRUCTURE_VIEW',
  ADMIN_DIAGNOSTIC_FILES_LIST = 'ADMIN_DIAGNOSTIC_FILES_LIST',
  ADMIN_DIAGNOSTIC_FILE_UPLOAD = 'ADMIN_DIAGNOSTIC_FILE_UPLOAD',
  ADMIN_DIAGNOSTIC_FILE_DELETE = 'ADMIN_DIAGNOSTIC_FILE_DELETE',
  ADMIN_STORAGE_CLEANUP = 'ADMIN_STORAGE_CLEANUP',
  
  // ==================
  // Tenant Actions
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
  // Plan & Billing Actions
  // ==================
  PLAN_CREATE = 'PLAN_CREATE',
  PLAN_UPDATE = 'PLAN_UPDATE',
  PLAN_DELETE = 'PLAN_DELETE',
  PLAN_CHANGE = 'PLAN_CHANGE',
  PLAN_UPGRADE = 'PLAN_UPGRADE',
  PLAN_DOWNGRADE = 'PLAN_DOWNGRADE',
  SUBSCRIPTION_CREATE = 'SUBSCRIPTION_CREATE',
  SUBSCRIPTION_CANCEL = 'SUBSCRIPTION_CANCEL',
  SUBSCRIPTION_RENEW = 'SUBSCRIPTION_RENEW',
  PAYMENT_METHOD_ADD = 'PAYMENT_METHOD_ADD',
  PAYMENT_METHOD_REMOVE = 'PAYMENT_METHOD_REMOVE',
  PAYMENT_METHOD_UPDATE = 'PAYMENT_METHOD_UPDATE',
  INVOICE_GENERATE = 'INVOICE_GENERATE',
  INVOICE_VIEW = 'INVOICE_VIEW',
  INVOICE_DOWNLOAD = 'INVOICE_DOWNLOAD',
  
  // ==================
  // Integration Actions
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
  // Security Actions
  // ==================
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  SECURITY_ALERT = 'SECURITY_ALERT',
  IP_BLOCKED = 'IP_BLOCKED',
  IP_UNBLOCKED = 'IP_UNBLOCKED',
  
  // ==================
  // System Actions
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
  
  // ==================
  // Audit System Actions
  // ==================
  AUDIT_LOG_QUERY = 'AUDIT_LOG_QUERY',
  AUDIT_LOG_EXPORT = 'AUDIT_LOG_EXPORT',
  AUDIT_STATS_VIEW = 'AUDIT_STATS_VIEW',
  AUDIT_LOG_SEARCH = 'AUDIT_LOG_SEARCH',
  
  // ==================
  // Custom/Generic Actions
  // ==================
  CUSTOM_ACTION = 'CUSTOM_ACTION',
  NOT_FOUND = 'NOT_FOUND',
  REQUEST_ERROR = 'REQUEST_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION'
}

/**
 * Audit resource types - the type of resource being acted upon
 */
export enum AuditResource {
  AUTH = 'auth',
  USERS = 'users',
  STORAGE = 'storage',
  TENANTS = 'tenants',
  PLANS = 'plans',
  BILLING = 'billing',
  INTEGRATIONS = 'integrations',
  WEBHOOKS = 'webhooks',
  SYSTEM = 'system',
  AUDIT = 'audit',
  API_KEYS = 'api_keys',
  SETTINGS = 'settings',
  NOTIFICATIONS = 'notifications',
  REPORTS = 'reports',
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
    AuditAction.BACKUP_RESTORED
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
    AuditAction.PLAN_DOWNGRADE,
    AuditAction.INTEGRATION_ERROR,
    AuditAction.WEBHOOK_FAILED
  ];
  
  // Error severity actions
  const errorActions: AuditAction[] = [
    AuditAction.LOGIN, // Failed logins are errors
    AuditAction.INVALID_SIGNATURE,
    AuditAction.REQUEST_ERROR,
    AuditAction.VALIDATION_ERROR,
    AuditAction.BUSINESS_RULE_VIOLATION
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
    AuditAction.DATA_EXPORT
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
  STORAGE: [
    AuditAction.STORAGE_SETUP,
    AuditAction.FILE_UPLOAD,
    AuditAction.FILE_DELETE,
    AuditAction.FILE_DOWNLOAD,
    AuditAction.FILE_LIST
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