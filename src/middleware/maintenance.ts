// src/middleware/maintenance.ts
import { Request, Response, NextFunction } from 'express';

export const maintenanceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip maintenance check for system endpoints
  if (req.path.startsWith('/api/system/') || req.path === '/health') {
    return next();
  }

  // Check if in maintenance mode
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  
  if (isMaintenanceMode) {
    res.setHeader('X-Maintenance-Mode', 'true');
    res.setHeader('X-Maintenance-End-Time', process.env.MAINTENANCE_END_TIME || '');
    res.setHeader('X-Maintenance-Message', process.env.MAINTENANCE_MESSAGE || 'System maintenance in progress');
    
    return res.status(503).json({
      error: 'Service Unavailable',
      message: process.env.MAINTENANCE_MESSAGE || 'System is under maintenance',
      estimatedEndTime: process.env.MAINTENANCE_END_TIME || null
    });
  }
  
  next();
};