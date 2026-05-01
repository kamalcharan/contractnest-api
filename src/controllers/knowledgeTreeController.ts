// src/controllers/knowledgeTreeController.ts
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { knowledgeTreeGeneratorService } from '../services/knowledgeTreeGeneratorService';
import { complianceTaggerService } from '../services/complianceTaggerService';

interface AuthRequest extends Request {
  user?: { id: string; email?: string };
}

// Replace LLM-generated short IDs (v1, sp1, cp1 …) with real UUIDs,
// keeping all cross-references consistent across mapping tables.
function resolveIds(payload: any): any {
  const variantMap: Record<string, string> = {};
  const sparePartMap: Record<string, string> = {};
  const checkpointMap: Record<string, string> = {};

  const variants = (payload.variants ?? []).map((v: any) => {
    const id = randomUUID();
    variantMap[v.id] = id;
    return { ...v, id };
  });

  const spare_parts = (payload.spare_parts ?? []).map((sp: any) => {
    const id = randomUUID();
    sparePartMap[sp.id] = id;
    return { ...sp, id };
  });

  const checkpoints = (payload.checkpoints ?? []).map((cp: any) => {
    const id = randomUUID();
    checkpointMap[cp.id] = id;
    return { ...cp, id };
  });

  const spare_part_variant_map = (payload.spare_part_variant_map ?? []).map((m: any) => ({
    ...m,
    id: randomUUID(),
    spare_part_id: sparePartMap[m.spare_part_id] ?? m.spare_part_id,
    variant_id: variantMap[m.variant_id] ?? m.variant_id,
  }));

  const checkpoint_values = (payload.checkpoint_values ?? []).map((cv: any) => ({
    ...cv,
    id: randomUUID(),
    checkpoint_id: checkpointMap[cv.checkpoint_id] ?? cv.checkpoint_id,
  }));

  const checkpoint_variant_map = (payload.checkpoint_variant_map ?? []).map((m: any) => ({
    ...m,
    id: randomUUID(),
    checkpoint_id: checkpointMap[m.checkpoint_id] ?? m.checkpoint_id,
    variant_id: variantMap[m.variant_id] ?? m.variant_id,
  }));

  const service_cycles = (payload.service_cycles ?? []).map((sc: any) => ({
    ...sc,
    id: randomUUID(),
    checkpoint_id: checkpointMap[sc.checkpoint_id] ?? sc.checkpoint_id,
  }));

  const context_overlays = (payload.context_overlays ?? []).map((co: any) => ({
    ...co,
    id: randomUUID(),
  }));

  return {
    ...payload,
    variants,
    spare_parts,
    spare_part_variant_map,
    checkpoints,
    checkpoint_values,
    checkpoint_variant_map,
    service_cycles,
    context_overlays,
  };
}

class KnowledgeTreeController {
  private getContext(req: AuthRequest) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const authHeader = req.headers.authorization;
    if (!tenantId || !authHeader) return null;
    return {
      tenantId,
      accessToken: authHeader.replace('Bearer ', ''),
    };
  }

  generate = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' },
      });
      return;
    }

    const { equipmentName, subCategory, resourceTemplateId, serviceActivity, existingKT } = req.body;

    if (!equipmentName || !subCategory || !resourceTemplateId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'equipmentName, subCategory, and resourceTemplateId are required',
        },
      });
      return;
    }

    try {
      const raw = await knowledgeTreeGeneratorService.generate({
        equipmentName,
        subCategory,
        resourceTemplateId,
        serviceActivity: serviceActivity || 'pm',
        existingKT: !!existingKT,
      });

      const payload = resolveIds(raw);
      payload.resource_template_id = resourceTemplateId;

      if (existingKT) {
        const missing: string[] = [];
        if (!payload.checkpoints?.length) missing.push('checkpoints');
        if (!payload.service_cycles?.length) missing.push('service_cycles');
        if (missing.length > 0) {
          throw new Error(`Incomplete generation — missing: ${missing.join(', ')}. Please retry.`);
        }

        const activityPayload = {
          resource_template_id: resourceTemplateId,
          service_activity: serviceActivity || 'pm',
          checkpoints: payload.checkpoints,
          checkpoint_values: payload.checkpoint_values,
          service_cycles: payload.service_cycles,
        };

        console.log(
          `✅ Activity KT ready (${activityPayload.service_activity}) — ` +
          `checkpoints: ${activityPayload.checkpoints.length}, ` +
          `service_cycles: ${activityPayload.service_cycles.length}`
        );
        res.status(200).json({ success: true, data: activityPayload });
      } else {
        const missing: string[] = [];
        if (!payload.variants?.length) missing.push('variants');
        if (!payload.checkpoints?.length) missing.push('checkpoints');
        if (!payload.service_cycles?.length) missing.push('service_cycles');
        if (missing.length > 0) {
          throw new Error(`Incomplete generation — missing: ${missing.join(', ')}. Please retry.`);
        }

        console.log(
          `✅ KT ready — variants: ${payload.variants.length}, ` +
          `spare_parts: ${payload.spare_parts?.length ?? 0}, ` +
          `checkpoints: ${payload.checkpoints.length}, ` +
          `service_cycles: ${payload.service_cycles.length}, ` +
          `context_overlays: ${payload.context_overlays?.length ?? 0}`
        );
        res.status(200).json({ success: true, data: payload });
      }
    } catch (error: any) {
      console.error('❌ KT generate error:', error.message);
      res.status(500).json({
        success: false,
        error: {
          code: 'GENERATE_FAILED',
          message: error.message || 'Failed to generate Knowledge Tree',
        },
      });
    }
  };

  // POST /api/knowledge-tree/tag-compliance
  // Body: { equipmentName, subCategory, resourceTemplateId, checkpoints: [{id, name, section_name, service_activity}] }
  tagCompliance = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' },
      });
      return;
    }

    const { equipmentName, subCategory, resourceTemplateId, checkpoints } = req.body;

    if (!equipmentName || !subCategory || !resourceTemplateId || !Array.isArray(checkpoints) || checkpoints.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'equipmentName, subCategory, resourceTemplateId, and checkpoints[] are required',
        },
      });
      return;
    }

    try {
      const tags = await complianceTaggerService.tag({
        equipmentName,
        subCategory,
        checkpoints,
      });

      res.status(200).json({ success: true, data: { resource_template_id: resourceTemplateId, tags } });
    } catch (error: any) {
      console.error('❌ Tag compliance error:', error.message);
      res.status(500).json({
        success: false,
        error: {
          code: 'TAG_COMPLIANCE_FAILED',
          message: error.message || 'Failed to tag compliance standards',
        },
      });
    }
  };
}

export const knowledgeTreeController = new KnowledgeTreeController();
