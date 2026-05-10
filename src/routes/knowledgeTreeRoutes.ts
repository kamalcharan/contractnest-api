// src/routes/knowledgeTreeRoutes.ts
import express, { Request, Response, NextFunction } from 'express';
import { knowledgeTreeController } from '../controllers/knowledgeTreeController';

const router = express.Router();

const validateHeaders = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'];
  if (!authHeader || !tenantId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } });
    return;
  }
  next();
};

// Legacy full generation (existingKT:true = + Install / + Decomm activity mode)
// existingKT:false = internally runs 4 steps in sequence
router.post('/generate', validateHeaders, knowledgeTreeController.generate);

// Step 1 — Variants only
router.post('/generate-variants', validateHeaders, knowledgeTreeController.generateVariants);

// Step 2 — Spare parts + variant mappings (receives variants[] from UI after pulling from DB)
router.post('/generate-spare-parts', validateHeaders, knowledgeTreeController.generateSpareParts);

// Step 3 — Checkpoints + values only (no service_cycles)
router.post('/generate-checkpoints', validateHeaders, knowledgeTreeController.generateCheckpoints);

// Step 4 — Service cycles only (receives checkpoints[] from UI after pulling from DB)
router.post('/generate-service-cycles', validateHeaders, knowledgeTreeController.generateServiceCycles);

// Step 5 — Pricing only (receives spareParts[] + serviceCycles[] from UI after pulling from DB)
router.post('/generate-pricing', validateHeaders, knowledgeTreeController.generatePricing);

// Option A — Generate service_name per section from existing checkpoints (patch, no wipe)
router.post('/generate-service-names', validateHeaders, knowledgeTreeController.generateServiceNames);

// Other routes
router.post('/tag-compliance', validateHeaders, knowledgeTreeController.tagCompliance);
router.post('/generate-overlays', validateHeaders, knowledgeTreeController.generateOverlays);

export default router;
