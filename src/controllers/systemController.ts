// src/controllers/systemController.ts
import { Request, Response } from 'express';
import { captureException } from '../utils/sentry';

// Define the health check type
interface HealthChecks {
  api: boolean;
  timestamp: string;
  database?: boolean;
  firebase?: boolean;
  supabase?: boolean;
}

/**
 * Get maintenance status
 */
export const getMaintenanceStatus = async (req: Request, res: Response) => {
  try {
    // Add debug logging
    console.log('🔍 Checking maintenance status...');
    console.log('MAINTENANCE_MODE env:', process.env.MAINTENANCE_MODE);
    console.log('Type of MAINTENANCE_MODE:', typeof process.env.MAINTENANCE_MODE);
    console.log('Is maintenance mode?:', process.env.MAINTENANCE_MODE === 'true');
    
    // Check maintenance mode from environment variables
    const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
    
    const response = {
      isInMaintenance: isMaintenanceMode,
      estimatedEndTime: process.env.MAINTENANCE_END_TIME || null,
      message: process.env.MAINTENANCE_MESSAGE || 'System maintenance in progress'
    };

    console.log('📤 Maintenance response:', response);

    // Set maintenance headers if in maintenance mode
    if (isMaintenanceMode) {
      res.setHeader('X-Maintenance-Mode', 'true');
      if (response.estimatedEndTime) {
        res.setHeader('X-Maintenance-End-Time', response.estimatedEndTime);
      }
      res.setHeader('X-Maintenance-Message', response.message);
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in getMaintenanceStatus:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_system', action: 'getMaintenanceStatus' }
    });
    
    res.status(500).json({ 
      error: 'Failed to check maintenance status',
      isInMaintenance: false // Safe default
    });
  }
};

/**
 * Get system health status
 */
export const getHealthStatus = async (req: Request, res: Response) => {
  try {
    const healthChecks: HealthChecks = {
      api: true,
      timestamp: new Date().toISOString()
    };

    // Check database connection
    try {
      // Add your database health check here
      // const dbHealth = await checkDatabaseHealth();
      healthChecks.database = true;
    } catch (dbError) {
      healthChecks.database = false;
    }

    // Check Firebase connection
    try {
      const { checkFirebaseStatus } = require('../utils/firebaseConfig');
      const firebaseStatus = await checkFirebaseStatus();
      healthChecks.firebase = firebaseStatus.initialized;
    } catch (fbError) {
      healthChecks.firebase = false;
    }

    // Check Supabase connection
    try {
      // Add your Supabase health check here
      healthChecks.supabase = true;
    } catch (sbError) {
      healthChecks.supabase = false;
    }

    // Overall health status
    const isHealthy = Object.entries(healthChecks)
      .filter(([key]) => key !== 'timestamp')
      .every(([_, status]) => status === true);

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks: healthChecks
    });
  } catch (error) {
    console.error('Error in getHealthStatus:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_system', action: 'getHealthStatus' }
    });
    
    res.status(503).json({ 
      status: 'unhealthy',
      error: 'Failed to check system health'
    });
  }
};

/**
 * Get session status for the current user
 */
export const getSessionStatus = async (req: Request, res: Response) => {
  try {
    // Get user ID from auth middleware
    const userId = (req as any).user?.id;
    const currentSessionId = req.headers['x-session-id'] as string;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // In a real implementation, you would:
    // 1. Store active sessions in Redis or database
    // 2. Check if current session is the only active one
    // 3. Return conflict status
    
    // For now, simple implementation
    const hasConflict = false; // Implement your session tracking logic
    
    const response = {
      hasConflict,
      currentSessionId,
      userId,
      activeSessionsCount: 1
    };

    // Set session conflict header if detected
    if (hasConflict) {
      res.setHeader('X-Session-Conflict', 'true');
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in getSessionStatus:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_system', action: 'getSessionStatus' },
      userId: (req as any).user?.id
    });
    
    res.status(500).json({ 
      error: 'Failed to check session status',
      hasConflict: false // Safe default
    });
  }
};