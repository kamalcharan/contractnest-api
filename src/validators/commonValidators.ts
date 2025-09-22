import { Request, Response, NextFunction } from 'express';

export const validateHeaders = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is required' });
  }
  
  if (!tenantId) {
    return res.status(400).json({ error: 'x-tenant-id header is required' });
  }
  
  next();
};