// src/controllers/knowledgeTreeController.ts
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { knowledgeTreeGeneratorService } from '../services/knowledgeTreeGeneratorService';
import { complianceTaggerService } from '../services/complianceTaggerService';
import { overlaysGeneratorService } from '../services/overlaysGeneratorService';

interface AuthRequest extends Request {
  user?: { id: string; email?: string };
}

// ── ID resolution helpers ─────────────────────────────────────────────────────

function resolveIds(payload: any): any {
  const variantMap: Record<string, string> = {};
  const sparePartMap: Record<string, string> = {};
  const checkpointMap: Record<string, string> = {};

  const variants = (payload.variants ?? []).map((v: any) => { const id = randomUUID(); variantMap[v.id] = id; return { ...v, id }; });
  const spare_parts = (payload.spare_parts ?? []).map((sp: any) => { const id = randomUUID(); sparePartMap[sp.id] = id; return { ...sp, id }; });
  const spare_part_variant_map = (payload.spare_part_variant_map ?? []).map((m: any) => ({ ...m, id: randomUUID(), spare_part_id: sparePartMap[m.spare_part_id] ?? m.spare_part_id, variant_id: variantMap[m.variant_id] ?? m.variant_id }));
  const checkpoints = (payload.checkpoints ?? []).map((cp: any) => { const id = randomUUID(); checkpointMap[cp.id] = id; return { ...cp, id }; });
  const checkpoint_values = (payload.checkpoint_values ?? []).map((cv: any) => ({ ...cv, id: randomUUID(), checkpoint_id: checkpointMap[cv.checkpoint_id] ?? cv.checkpoint_id }));
  const checkpoint_variant_map = (payload.checkpoint_variant_map ?? []).map((m: any) => ({ ...m, id: randomUUID(), checkpoint_id: checkpointMap[m.checkpoint_id] ?? m.checkpoint_id, variant_id: variantMap[m.variant_id] ?? m.variant_id }));
  const service_cycles = (payload.service_cycles ?? []).map((sc: any) => ({ ...sc, id: randomUUID(), checkpoint_id: checkpointMap[sc.checkpoint_id] ?? sc.checkpoint_id }));

  return { ...payload, variants, spare_parts, spare_part_variant_map, checkpoints, checkpoint_values, checkpoint_variant_map, service_cycles, context_overlays: [] };
}

function resolveVariantIds(payload: any): any {
  const variants = (payload.variants ?? []).map((v: any) => ({ ...v, id: randomUUID() }));
  return { ...payload, variants };
}

function resolveSparePartIds(payload: any): any {
  const sparePartMap: Record<string, string> = {};
  const spare_parts = (payload.spare_parts ?? []).map((sp: any) => { const id = randomUUID(); sparePartMap[sp.id] = id; return { ...sp, id }; });
  const spare_part_variant_map = (payload.spare_part_variant_map ?? []).map((m: any) => ({ ...m, id: randomUUID(), spare_part_id: sparePartMap[m.spare_part_id] ?? m.spare_part_id }));
  return { ...payload, spare_parts, spare_part_variant_map };
}

function resolveCheckpointIds(payload: any): any {
  const checkpointMap: Record<string, string> = {};
  const checkpoints = (payload.checkpoints ?? []).map((cp: any) => { const id = randomUUID(); checkpointMap[cp.id] = id; return { ...cp, id }; });
  const checkpoint_values = (payload.checkpoint_values ?? []).map((cv: any) => ({ ...cv, id: randomUUID(), checkpoint_id: checkpointMap[cv.checkpoint_id] ?? cv.checkpoint_id }));
  const checkpoint_variant_map = (payload.checkpoint_variant_map ?? []).map((m: any) => ({ ...m, id: randomUUID(), checkpoint_id: checkpointMap[m.checkpoint_id] ?? m.checkpoint_id }));
  return { ...payload, checkpoints, checkpoint_values, checkpoint_variant_map, _checkpointIdMap: checkpointMap };
}

function resolveServiceCycleIds(payload: any): any {
  // checkpoint_ids in service_cycles are already real UUIDs from DB — just assign cycle IDs
  const service_cycles = (payload.service_cycles ?? []).map((sc: any) => ({ ...sc, id: randomUUID() }));
  return { ...payload, service_cycles };
}

// ── Controller ────────────────────────────────────────────────────────────────

class KnowledgeTreeController {
  private getContext(req: AuthRequest) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const authHeader = req.headers.authorization;
    if (!tenantId || !authHeader) return null;
    return { tenantId, accessToken: authHeader.replace('Bearer ', '') };
  }

  // POST /api/knowledge-tree/generate
  //   existingKT:true  → activity single prompt (+ Install / + Decomm) — unchanged
  //   existingKT:false → runs 4 focused steps internally, returns combined payload
  generate = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }

    const { equipmentName, subCategory, resourceTemplateId, serviceActivity, existingKT, layer } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, and resourceTemplateId are required' } }); return;
    }

    try {
      if (existingKT) {
        // Activity mode — single prompt, unchanged
        const raw = await knowledgeTreeGeneratorService.generate({ equipmentName, subCategory, resourceTemplateId, serviceActivity: serviceActivity || 'pm', existingKT: true });
        const payload = resolveIds(raw);
        payload.resource_template_id = resourceTemplateId;
        if (!payload.checkpoints?.length || !payload.service_cycles?.length) throw new Error(`Incomplete generation — missing: ${[!payload.checkpoints?.length && 'checkpoints', !payload.service_cycles?.length && 'service_cycles'].filter(Boolean).join(', ')}. Please retry.`);
        const activityPayload = { resource_template_id: resourceTemplateId, service_activity: serviceActivity || 'pm', checkpoints: payload.checkpoints, checkpoint_values: payload.checkpoint_values, service_cycles: payload.service_cycles };
        console.log(`✅ Activity KT (${activityPayload.service_activity}) — checkpoints: ${activityPayload.checkpoints.length}, cycles: ${activityPayload.service_cycles.length}`);
        res.status(200).json({ success: true, data: activityPayload });

      } else {
        // Full generation — 4 focused steps
        console.log(`🔄 Full KT — 4 steps for "${equipmentName}"`);

        // Step 1: variants
        const rawV = await knowledgeTreeGeneratorService.generateVariants({ equipmentName, subCategory, resourceTemplateId });
        if (!rawV.variants?.length) throw new Error('Step 1: No variants returned');
        const vPayload = resolveVariantIds(rawV);
        const variantRefs = vPayload.variants.map((v: any) => ({ id: v.id, name: v.name, capacity_range: v.capacity_range ?? null }));
        console.log(`✅ 1/4 — ${vPayload.variants.length} variants`);

        // Step 2: spare parts / consumables (real variant UUIDs passed in)
        const activity = serviceActivity || 'pm';
        const ktLayer = layer || 'equipment';
        const rawP = await knowledgeTreeGeneratorService.generateSpareParts({ equipmentName, subCategory, resourceTemplateId, layer: ktLayer, variants: variantRefs });
        const pPayload = resolveSparePartIds(rawP);
        console.log(`✅ 2/4 — ${pPayload.spare_parts?.length ?? 0} spare parts, ${pPayload.spare_part_variant_map?.length ?? 0} mappings`);

        // Step 3: checkpoints + values only
        const rawC = await knowledgeTreeGeneratorService.generateCheckpoints({ equipmentName, subCategory, resourceTemplateId, serviceActivity: activity, layer: ktLayer, variants: variantRefs });
        if (!rawC.checkpoints?.length) throw new Error('Step 3: No checkpoints returned');
        const cPayload = resolveCheckpointIds(rawC);
        console.log(`✅ 3/4 — ${cPayload.checkpoints.length} checkpoints, ${cPayload.checkpoint_values?.length ?? 0} values`);

        // Step 4: service cycles (real checkpoint UUIDs passed in)
        const checkpointRefs = cPayload.checkpoints.map((cp: any) => ({ id: cp.id, name: cp.name, section_name: cp.section_name, service_activity: cp.service_activity }));
        const rawSC = await knowledgeTreeGeneratorService.generateServiceCycles({ equipmentName, subCategory, resourceTemplateId, serviceActivity: activity, checkpoints: checkpointRefs });
        if (!rawSC.service_cycles?.length) throw new Error('Step 4: No service cycles returned');
        const scPayload = resolveServiceCycleIds(rawSC);
        console.log(`✅ 4/4 — ${scPayload.service_cycles.length} service cycles`);

        const combined = {
          resource_template_id: resourceTemplateId,
          variants: vPayload.variants,
          spare_parts: pPayload.spare_parts ?? [],
          spare_part_variant_map: pPayload.spare_part_variant_map ?? [],
          checkpoints: cPayload.checkpoints,
          checkpoint_values: cPayload.checkpoint_values ?? [],
          checkpoint_variant_map: cPayload.checkpoint_variant_map ?? [],
          service_cycles: scPayload.service_cycles,
          context_overlays: [],
        };

        console.log(`✅ KT complete — variants:${combined.variants.length}, parts:${combined.spare_parts.length}, checkpoints:${combined.checkpoints.length}, cycles:${combined.service_cycles.length}`);
        res.status(200).json({ success: true, data: combined });
      }
    } catch (error: any) {
      console.error('❌ KT generate error:', error.message);
      res.status(500).json({ success: false, error: { code: 'GENERATE_FAILED', message: error.message || 'Failed to generate Knowledge Tree' } });
    }
  };

  // POST /api/knowledge-tree/generate-variants — Step 1
  generateVariants = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }
    const { equipmentName, subCategory, resourceTemplateId } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, resourceTemplateId required' } }); return; }
    try {
      const raw = await knowledgeTreeGeneratorService.generateVariants({ equipmentName, subCategory, resourceTemplateId });
      if (!raw.variants?.length) throw new Error('No variants returned');
      const payload = resolveVariantIds(raw);
      payload.resource_template_id = resourceTemplateId;
      console.log(`✅ Step 1 — ${payload.variants.length} variants for "${equipmentName}"`);
      res.status(200).json({ success: true, step: 1, data: payload });
    } catch (error: any) {
      console.error('❌ Step 1 error:', error.message);
      res.status(500).json({ success: false, step: 1, error: { code: 'GENERATE_VARIANTS_FAILED', message: error.message } });
    }
  };

  // POST /api/knowledge-tree/generate-spare-parts — Step 2
  generateSpareParts = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }
    const { equipmentName, subCategory, resourceTemplateId, layer, variants } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, resourceTemplateId required' } }); return; }
    if (!Array.isArray(variants) || variants.length === 0) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'variants[] required — pull from DB first' } }); return; }
    try {
      const raw = await knowledgeTreeGeneratorService.generateSpareParts({ equipmentName, subCategory, resourceTemplateId, layer: layer || 'equipment', variants });
      if (!raw.spare_parts?.length) throw new Error('No spare parts returned');
      const payload = resolveSparePartIds(raw);
      payload.resource_template_id = resourceTemplateId;
      console.log(`✅ Step 2 — ${payload.spare_parts.length} parts, ${payload.spare_part_variant_map?.length ?? 0} mappings for "${equipmentName}"`);
      res.status(200).json({ success: true, step: 2, data: payload });
    } catch (error: any) {
      console.error('❌ Step 2 error:', error.message);
      res.status(500).json({ success: false, step: 2, error: { code: 'GENERATE_SPARE_PARTS_FAILED', message: error.message } });
    }
  };

  // POST /api/knowledge-tree/generate-checkpoints — Step 3
  generateCheckpoints = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }
    const { equipmentName, subCategory, resourceTemplateId, serviceActivity, layer, variants } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, resourceTemplateId required' } }); return; }
    if (!Array.isArray(variants) || variants.length === 0) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'variants[] required — pull from DB first' } }); return; }
    try {
      const activity = serviceActivity || 'pm';
      const raw = await knowledgeTreeGeneratorService.generateCheckpoints({ equipmentName, subCategory, resourceTemplateId, serviceActivity: activity, layer: layer || 'equipment', variants });
      if (!raw.checkpoints?.length) throw new Error('No checkpoints returned');
      const payload = resolveCheckpointIds(raw);
      payload.resource_template_id = resourceTemplateId;
      payload.service_activity = activity;
      delete payload._checkpointIdMap;
      console.log(`✅ Step 3 — ${payload.checkpoints.length} checkpoints, ${payload.checkpoint_values?.length ?? 0} values for "${equipmentName}"`);
      res.status(200).json({ success: true, step: 3, data: payload });
    } catch (error: any) {
      console.error('❌ Step 3 error:', error.message);
      res.status(500).json({ success: false, step: 3, error: { code: 'GENERATE_CHECKPOINTS_FAILED', message: error.message } });
    }
  };

  // POST /api/knowledge-tree/generate-service-cycles — Step 4
  // UI pulls real checkpoint UUIDs from DB after step 3, passes them here.
  generateServiceCycles = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }
    const { equipmentName, subCategory, resourceTemplateId, serviceActivity, checkpoints } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, resourceTemplateId required' } }); return; }
    if (!Array.isArray(checkpoints) || checkpoints.length === 0) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'checkpoints[] required — pull from DB first' } }); return; }
    try {
      const activity = serviceActivity || 'pm';
      const raw = await knowledgeTreeGeneratorService.generateServiceCycles({ equipmentName, subCategory, resourceTemplateId, serviceActivity: activity, checkpoints });
      if (!raw.service_cycles?.length) throw new Error('No service cycles returned');
      const payload = resolveServiceCycleIds(raw);
      payload.resource_template_id = resourceTemplateId;
      console.log(`✅ Step 4 — ${payload.service_cycles.length} service cycles for "${equipmentName}"`);
      res.status(200).json({ success: true, step: 4, data: payload });
    } catch (error: any) {
      console.error('❌ Step 4 error:', error.message);
      res.status(500).json({ success: false, step: 4, error: { code: 'GENERATE_SERVICE_CYCLES_FAILED', message: error.message } });
    }
  };

  // POST /api/knowledge-tree/tag-compliance
  tagCompliance = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }
    const { equipmentName, subCategory, resourceTemplateId, checkpoints } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId || !Array.isArray(checkpoints) || checkpoints.length === 0) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, resourceTemplateId, checkpoints[] required' } }); return; }
    try {
      const tags = await complianceTaggerService.tag({ equipmentName, subCategory, checkpoints });
      res.status(200).json({ success: true, data: { resource_template_id: resourceTemplateId, tags } });
    } catch (error: any) {
      console.error('❌ Tag compliance error:', error.message);
      res.status(500).json({ success: false, error: { code: 'TAG_COMPLIANCE_FAILED', message: error.message } });
    }
  };

  // POST /api/knowledge-tree/generate-service-names — Option A: patch service_name on existing checkpoints
  // Body: { equipmentName, subCategory, resourceTemplateId, checkpoints: [{ id, name, section_name }] }
  generateServiceNames = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }
    const { equipmentName, subCategory, resourceTemplateId, checkpoints } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, resourceTemplateId required' } }); return;
    }
    if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'checkpoints[] required — pull from DB first' } }); return;
    }
    try {
      const raw = await knowledgeTreeGeneratorService.generateServiceNames({ equipmentName, subCategory, resourceTemplateId, checkpoints });
      if (!raw.service_names?.length) throw new Error('No service names returned');
      console.log(`✅ Service names — ${raw.service_names.length} sections named for "${equipmentName}"`);
      res.status(200).json({ success: true, data: { resource_template_id: resourceTemplateId, service_names: raw.service_names } });
    } catch (error: any) {
      console.error('❌ Generate service names error:', error.message);
      res.status(500).json({ success: false, error: { code: 'GENERATE_SERVICE_NAMES_FAILED', message: error.message } });
    }
  };

  // POST /api/knowledge-tree/generate-pricing — Step 5
  // UI pulls real spare part + service cycle UUIDs from DB, passes them here.
  // Body: { equipmentName, subCategory, resourceTemplateId, currency, geo, spareParts[], serviceCycles[] }
  generatePricing = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }
    const { equipmentName, subCategory, resourceTemplateId, currency, geo, spareParts, serviceCycles } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, resourceTemplateId required' } }); return;
    }
    if ((!Array.isArray(spareParts) || spareParts.length === 0) && (!Array.isArray(serviceCycles) || serviceCycles.length === 0)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'spareParts[] or serviceCycles[] required — pull from DB first' } }); return;
    }
    try {
      const raw = await knowledgeTreeGeneratorService.generatePricing({
        equipmentName,
        subCategory,
        resourceTemplateId,
        currency: currency || 'INR',
        geo: geo || 'IN',
        spareParts: spareParts || [],
        serviceCycles: serviceCycles || [],
      });
      if (!raw.spare_parts?.length && !raw.service_cycles?.length) throw new Error('No pricing returned');
      console.log(`✅ Step 5 — pricing for ${raw.spare_parts?.length ?? 0} parts, ${raw.service_cycles?.length ?? 0} cycles [${currency || 'INR'}/${geo || 'IN'}]`);
      res.status(200).json({ success: true, step: 5, data: { resource_template_id: resourceTemplateId, currency: currency || 'INR', geo: geo || 'IN', spare_parts: raw.spare_parts ?? [], service_cycles: raw.service_cycles ?? [] } });
    } catch (error: any) {
      console.error('❌ Step 5 error:', error.message);
      res.status(500).json({ success: false, step: 5, error: { code: 'GENERATE_PRICING_FAILED', message: error.message } });
    }
  };

  // POST /api/knowledge-tree/generate-overlays
  generateOverlays = async (req: AuthRequest, res: Response): Promise<void> => {
    const context = this.getContext(req);
    if (!context) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authorization or x-tenant-id header' } }); return; }
    const { equipmentName, subCategory, resourceTemplateId } = req.body;
    if (!equipmentName || !subCategory || !resourceTemplateId) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'equipmentName, subCategory, resourceTemplateId required' } }); return; }
    try {
      const rawOverlays = await overlaysGeneratorService.generate({ equipmentName, subCategory, resourceTemplateId });
      const context_overlays = rawOverlays.map((co: any) => ({ ...co, id: randomUUID() }));
      console.log(`✅ Overlays — ${context_overlays.length} for "${equipmentName}"`);
      res.status(200).json({ success: true, data: { resource_template_id: resourceTemplateId, context_overlays } });
    } catch (error: any) {
      console.error('❌ Overlays error:', error.message);
      res.status(500).json({ success: false, error: { code: 'GENERATE_OVERLAYS_FAILED', message: error.message } });
    }
  };
}

export const knowledgeTreeController = new KnowledgeTreeController();
