// src/services/auditService.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { captureException } from '../utils/sentry';

// Import all audit constants
import {
  AuditAction,
  AuditResource,
  AuditSeverity,
  AuditLogEntry,
  AuditContext,
  AuditQueryFilters,
  AuditStatistics,
  AuditExportOptions,
  getDefaultSeverity,
  shouldAlert
} from '../constants/auditConstants';

// Re-export constants for backward compatibility
export {
  AuditAction,
  AuditResource,
  AuditSeverity,
  AuditLogEntry,
  AuditContext,
  AuditQueryFilters,
  AuditStatistics
};

/**
 * Audit Service Class - API Layer Implementation
 * Uses RPC function calls instead of direct inserts since we don't have service role key
 */
class AuditService {
  private supabase: SupabaseClient | null = null;
  private batchQueue: any[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_INTERVAL = 5000; // 5 seconds
  private isConfigured = false;
  
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY; // Using anon key
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️  Audit Service: Missing Supabase configuration. Audit logging will be disabled.');
      console.warn('⚠️  Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
      this.isConfigured = false;
      return;
    }
    
    try {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.isConfigured = true;
      
      // Start batch processing
      this.startBatchProcessing();
      
      console.log('✅ Audit Service: Initialized successfully (API mode with RPC)');
    } catch (error) {
      console.error('❌ Audit Service: Failed to initialize', error);
      this.isConfigured = false;
    }
  }
  
  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry, context: AuditContext): Promise<void> {
    if (!this.isConfigured || !this.supabase) {
      console.debug('[Audit] Skipping - service not configured');
      return;
    }
    
    try {
      // Determine severity if not provided
      const severity = entry.severity || (
        entry.action in AuditAction 
          ? getDefaultSeverity(entry.action as AuditAction)
          : AuditSeverity.INFO
      );
      
      const auditLog = {
        tenant_id: context.tenantId,
        user_id: context.userId,
        action: entry.action,
        resource: entry.resource,
        resource_id: entry.resourceId,
        metadata: {
          ...entry.metadata,
          user_email: context.userEmail,
          all_tenant_ids: context.allTenantIds,
          is_super_admin: context.isSuperAdmin,
          is_tenant_admin: context.isTenantAdmin,
          api_layer: true // Mark this as coming from API layer
        },
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
        session_id: context.sessionId,
        success: entry.success ?? true,
        error_message: entry.error,
        severity,
        correlation_id: entry.correlationId || uuidv4(),
        created_at: new Date().toISOString()
      };
      
      // Check if we should alert on this action
      if (shouldAlert(entry.action as AuditAction, severity)) {
        this.triggerAlert(auditLog);
      }
      
      // Add to batch queue
      this.batchQueue.push(auditLog);
      
      // Process immediately if batch is full
      if (this.batchQueue.length >= this.BATCH_SIZE) {
        await this.processBatch();
      }
    } catch (error) {
      console.error('Audit logging error:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'audit_service', action: 'log' },
        extra: { entry, context }
      });
    }
  }
  
  /**
   * Create audit context from Express request
   */
  createContext(req: any): AuditContext {
    return {
      tenantId: req.headers['x-tenant-id'] || req.tenant?.id || '',
      userId: req.user?.id,
      userEmail: req.user?.email,
      sessionId: req.session?.id || req.headers['x-session-id'],
      ipAddress: req.ip || 
                 req.headers['x-forwarded-for'] || 
                 req.headers['x-real-ip'] ||
                 req.connection?.remoteAddress || 
                 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      allTenantIds: req.user?.tenants?.map((t: any) => t.id),
      isSuperAdmin: req.user?.is_admin || false,
      isTenantAdmin: req.user?.current_tenant_admin || false
    };
  }
  
  /**
   * Log with Express request context
   */
  async logRequest(req: any, entry: AuditLogEntry): Promise<void> {
    const context = this.createContext(req);
    await this.log(entry, context);
  }
  
  /**
   * Query audit logs (respects RLS)
   */
  async query(filters: AuditQueryFilters, userToken: string): Promise<{
    logs: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    if (!this.isConfigured) {
      console.warn('[Audit] Query skipped - service not configured');
      return {
        logs: [],
        total: 0,
        limit: filters.limit || 50,
        offset: filters.offset || 0
      };
    }
    
    try {
      // Create a client with user's token to respect RLS
      const userSupabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${userToken}`
            }
          }
        }
      );
      
      // Use the view for detailed information
      let query = userSupabase
        .from('v_audit_logs_detailed')
        .select('*', { count: 'exact' });
      
      // Apply filters
      if (filters.tenantId) query = query.eq('tenant_id', filters.tenantId);
      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.action) query = query.eq('action', filters.action);
      if (filters.resource) query = query.eq('resource', filters.resource);
      if (filters.severity) query = query.eq('severity', filters.severity);
      if (filters.success !== undefined) query = query.eq('success', filters.success);
      if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
      if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());
      if (filters.correlationId) query = query.eq('correlation_id', filters.correlationId);
      if (filters.sessionId) query = query.eq('session_id', filters.sessionId);
      
      // Apply text search if provided
      if (filters.searchTerm) {
        query = query.or(`action.ilike.%${filters.searchTerm}%,resource.ilike.%${filters.searchTerm}%,error_message.ilike.%${filters.searchTerm}%`);
      }
      
      // Apply ordering
      const orderBy = filters.orderBy || 'created_at';
      const orderDirection = filters.orderDirection || 'desc';
      query = query.order(orderBy, { ascending: orderDirection === 'asc' });
      
      // Apply pagination
      const limit = Math.min(filters.limit || 50, 1000); // Max 1000 records
      const offset = filters.offset || 0;
      query = query.limit(limit).range(offset, offset + limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) {
        throw error;
      }
      
      return {
        logs: data || [],
        total: count || 0,
        limit,
        offset
      };
    } catch (error) {
      console.error('Error querying audit logs:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'audit_service', action: 'query' },
        extra: { filters }
      });
      throw error;
    }
  }
  
  /**
   * Get audit log statistics
   */
  async getStatistics(
    tenantId: string, 
    startDate: Date, 
    endDate: Date,
    userToken: string
  ): Promise<AuditStatistics> {
    if (!this.isConfigured) {
      console.warn('[Audit] Statistics skipped - service not configured');
      return {
        totalLogs: 0,
        actionCounts: {},
        severityCounts: {},
        resourceCounts: {},
        successRate: 0,
        errorRate: 0,
        topUsers: [],
        topActions: [],
        timeRange: { start: startDate, end: endDate },
        hourlyDistribution: {},
        dailyDistribution: {}
      };
    }
    
    try {
      const userSupabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${userToken}`
            }
          }
        }
      );
      
      // Get all logs for the period
      const { data: logs, error } = await userSupabase
        .from('t_audit_logs')
        .select('action, resource, severity, success, user_id, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (error) throw error;
      
      // Calculate statistics
      const stats: AuditStatistics = {
        totalLogs: logs?.length || 0,
        actionCounts: {},
        severityCounts: {},
        resourceCounts: {},
        successRate: 0,
        errorRate: 0,
        topUsers: [],
        topActions: [],
        timeRange: { start: startDate, end: endDate },
        hourlyDistribution: {},
        dailyDistribution: {}
      };
      
      if (logs && logs.length > 0) {
        let successCount = 0;
        const userCounts: Record<string, number> = {};
        const actionCounts: Record<string, number> = {};
        
        logs.forEach(log => {
          // Action counts
          stats.actionCounts[log.action] = (stats.actionCounts[log.action] || 0) + 1;
          actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
          
          // Resource counts
          stats.resourceCounts[log.resource] = (stats.resourceCounts[log.resource] || 0) + 1;
          
          // Severity counts
          stats.severityCounts[log.severity] = (stats.severityCounts[log.severity] || 0) + 1;
          
          // Success rate
          if (log.success) successCount++;
          
          // User counts
          if (log.user_id) {
            userCounts[log.user_id] = (userCounts[log.user_id] || 0) + 1;
          }
          
          // Time distribution
          const date = new Date(log.created_at);
          const hour = date.getHours();
          const day = date.toISOString().split('T')[0];
          
          stats.hourlyDistribution![hour] = (stats.hourlyDistribution![hour] || 0) + 1;
          stats.dailyDistribution![day] = (stats.dailyDistribution![day] || 0) + 1;
        });
        
        // Calculate rates
        stats.successRate = (successCount / logs.length) * 100;
        stats.errorRate = 100 - stats.successRate;
        
        // Get top users
        stats.topUsers = Object.entries(userCounts)
          .map(([userId, count]) => ({ userId, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        // Get top actions
        stats.topActions = Object.entries(actionCounts)
          .map(([action, count]) => ({ action, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }
      
      return stats;
    } catch (error) {
      console.error('Error getting audit statistics:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'audit_service', action: 'getStatistics' },
        extra: { tenantId, startDate, endDate }
      });
      throw error;
    }
  }
  
  /**
   * Export audit logs
   */
  async exportLogs(
    filters: AuditQueryFilters,
    format: 'csv' | 'json',
    userToken: string
  ): Promise<string> {
    if (!this.isConfigured) {
      console.warn('[Audit] Export skipped - service not configured');
      return format === 'json' ? '[]' : 'No data to export';
    }
    
    try {
      // Get all logs without pagination limit
      const allFilters = { ...filters, limit: 10000, offset: 0 };
      const { logs } = await this.query(allFilters, userToken);
      
      if (format === 'json') {
        return JSON.stringify(logs, null, 2);
      }
      
      // CSV format
      if (logs.length === 0) {
        return 'No data to export';
      }
      
      // Create CSV header
      const headers = [
        'Date/Time',
        'Action',
        'Resource',
        'Resource ID',
        'User ID',
        'User Name',
        'User Email',
        'Tenant Name',
        'IP Address',
        'Success',
        'Severity',
        'Error Message'
      ];
      
      const csvRows = [headers.join(',')];
      
      // Add data rows
      logs.forEach(log => {
        const row = [
          new Date(log.created_at).toISOString(),
          log.action,
          log.resource,
          log.resource_id || '',
          log.user_id || '',
          log.user_name || '',
          log.user_email || '',
          log.tenant_name || '',
          log.ip_address || '',
          log.success ? 'Yes' : 'No',
          log.severity,
          log.error_message ? `"${log.error_message.replace(/"/g, '""')}"` : ''
        ];
        csvRows.push(row.join(','));
      });
      
      return csvRows.join('\n');
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'audit_service', action: 'exportLogs' },
        extra: { filters, format }
      });
      throw error;
    }
  }
  
  /**
   * Process batch of audit logs using RPC function
   */
  private async processBatch(): Promise<void> {
    if (!this.isConfigured || !this.supabase || this.batchQueue.length === 0) return;
    
    const batch = this.batchQueue.splice(0, this.BATCH_SIZE);
    
    try {
      // Use RPC to insert batch of logs
      const { error } = await this.supabase.rpc('insert_audit_logs_batch', {
        logs: batch
      });
      
      if (error) {
        console.error('Failed to insert audit batch:', error);
        // Re-add failed items to queue for retry
        this.batchQueue.unshift(...batch);
      } else {
        console.log(`[Audit] Successfully inserted ${batch.length} logs`);
      }
    } catch (error) {
      console.error('Batch processing error:', error);
      // Re-add failed items to queue for retry
      this.batchQueue.unshift(...batch);
    }
  }
  
  /**
   * Start batch processing timer
   */
  private startBatchProcessing(): void {
    if (!this.isConfigured) return;
    
    this.batchTimer = setInterval(async () => {
      await this.processBatch();
    }, this.BATCH_INTERVAL);
  }
  
  /**
   * Stop batch processing (for cleanup)
   */
  async stop(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Process any remaining items
    await this.processBatch();
  }
  
  /**
   * Trigger alert for critical audit events
   */
  private async triggerAlert(auditLog: any): Promise<void> {
    // TODO: Implement alerting mechanism
    // This could send emails, SMS, Slack notifications, etc.
    console.warn('[AUDIT ALERT]', {
      action: auditLog.action,
      severity: auditLog.severity,
      tenantId: auditLog.tenant_id,
      userId: auditLog.user_id,
      error: auditLog.error_message
    });
  }
}

// Export singleton instance
export const auditService = new AuditService();

// Cleanup on process termination
process.on('SIGTERM', async () => {
  await auditService.stop();
});

process.on('SIGINT', async () => {
  await auditService.stop();
});