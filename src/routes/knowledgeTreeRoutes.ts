// src/routes/knowledgeTreeRoutes.ts
import express, { Request, Response, NextFunction } from 'express';
import { knowledgeTreeController } from '../controllers/knowledgeTreeController';

const router = express.Router();

const validateHeaders = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'];
  if (!authHeader || !tenantId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' },
    });
    return;
  }
  next();
};

// POST /api/knowledge-tree/generate
router.post('/generate', validateHeaders, knowledgeTreeController.generate);

// POST /api/knowledge-tree/tag-compliance
// Body: { equipmentName, subCategory, resourceTemplateId, checkpoints: [{id, name, section_name, service_activity}] }
// Returns: { success: true, data: { resource_template_id, tags: [{checkpoint_id, compliance_standard, is_mandatory}] } }
router.post('/tag-compliance', validateHeaders, knowledgeTreeController.tagCompliance);

export default router;
