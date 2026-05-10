// src/services/knowledgeTreeGeneratorService.ts
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { jsonrepair } from 'jsonrepair';

interface GenerateKTInput {
  equipmentName: string;
  subCategory: string;
  resourceTemplateId: string;
  serviceActivity?: string;
  existingKT?: boolean;
}

interface GenerateStepInput {
  equipmentName: string;
  subCategory: string;
  resourceTemplateId: string;
  serviceActivity?: string;
  layer?: string;
  variants?: Array<{ id: string; name: string; capacity_range?: string | null }>;
  checkpoints?: Array<{ id: string; name: string; section_name: string; service_activity: string }>;
}

interface GenerateServiceNamesInput {
  equipmentName: string;
  subCategory: string;
  resourceTemplateId: string;
  checkpoints: Array<{ id: string; name: string; section_name: string }>;
}

interface GeneratePricingInput {
  equipmentName: string;
  subCategory: string;
  resourceTemplateId: string;
  currency?: string;
  geo?: string;
  spareParts?: Array<{ id: string; name: string; component_group: string }>;
  serviceCycles?: Array<{ id: string; catalog_name?: string | null; frequency_value: number; frequency_unit: string; checkpoint_name?: string }>;
}

class KnowledgeTreeGeneratorService {
  private readonly anthropicKey: string;
  private readonly anthropicUrl: string;
  private readonly model: string;

  constructor() {
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    this.anthropicUrl = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
    this.model = process.env.KT_LLM_MODEL || 'claude-sonnet-4-6';
    if (!this.anthropicKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set — KnowledgeTreeGeneratorService disabled');
    } else {
      console.log(`✅ KnowledgeTreeGeneratorService: model=${this.model}`);
    }
  }

  private loadSkill(fileName: string, replacements?: Record<string, string>): string {
    const skillPath = path.join(process.cwd(), 'src', 'skills', fileName);
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill file not found at: ${skillPath}`);
    }
    let content = fs.readFileSync(skillPath, 'utf-8');
    if (replacements) {
      for (const [token, value] of Object.entries(replacements)) {
        content = content.replace(new RegExp(token, 'g'), value);
      }
    }
    return content;
  }

  private async callAnthropic(systemPrompt: string, userMessage: string, maxTokens: number, label: string): Promise<any> {
    console.log(`🤖 KT [${label}]: maxTokens=${maxTokens}`);

    let response;
    try {
      response = await axios.post(
        this.anthropicUrl,
        {
          model: this.model,
          max_tokens: maxTokens,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: userMessage }],
        },
        {
          headers: {
            'x-api-key': this.anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
            'content-type': 'application/json',
          },
          timeout: 300000,
        }
      );
    } catch (axiosErr: any) {
      const status = axiosErr.response?.status;
      const body = axiosErr.response?.data;
      console.error(`❌ Anthropic API error (${status}):`, JSON.stringify(body));
      throw new Error(body?.error?.message || axiosErr.message);
    }

    const stopReason: string = response.data?.stop_reason;
    const rawText: string = response.data?.content?.[0]?.text;
    const usage = response.data?.usage;

    if (usage) {
      console.log(`📊 [${label}] in: ${usage.input_tokens} (cached: ${usage.cache_read_input_tokens ?? 0}), out: ${usage.output_tokens}, stop: ${stopReason}`);
    }
    if (stopReason === 'max_tokens') {
      console.warn(`⚠️ [${label}] hit max_tokens (${maxTokens}) — output truncated`);
    }
    if (!rawText) throw new Error('Empty response from Anthropic API');

    console.log(`🔍 [${label}] raw: ${rawText.length} chars`);

    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) throw new Error(`[${label}] No JSON found in response`);

    const jsonText = rawText.substring(firstBrace, lastBrace + 1);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.warn(`⚠️ [${label}] JSON repair needed`);
      try {
        parsed = JSON.parse(jsonrepair(jsonText));
        console.log(`✅ [${label}] JSON repaired`);
      } catch (e: any) {
        throw new Error(`[${label}] invalid JSON: ${e.message}`);
      }
    }

    const topKeys = Object.keys(parsed);
    const arraySizes = topKeys.filter(k => Array.isArray(parsed[k])).map(k => `${k}:${parsed[k].length}`).join(', ');
    console.log(`🔍 [${label}] Keys: [${topKeys.join(', ')}] | ${arraySizes || 'no arrays'}`);

    return parsed;
  }

  // ── Legacy: activity-specific single prompt (+ Install / + Decomm) ───────────
  private loadSkillPrompt(serviceActivity: string, existingKT: boolean): string {
    const fileName = existingKT ? 'kt-activity-generator.md' : 'kt-equipment-generator.md';
    return this.loadSkill(fileName, { '\\{\\{SERVICE_ACTIVITY\\}\\}': serviceActivity });
  }

  async generate(input: GenerateKTInput): Promise<any> {
    const { equipmentName, subCategory, resourceTemplateId, serviceActivity = 'pm', existingKT = false } = input;
    if (!this.anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const systemPrompt = this.loadSkillPrompt(serviceActivity, existingKT);
    const userMessage = `Generate a ${existingKT ? '' : 'complete '}Knowledge Tree for:\nEquipment: ${equipmentName}\nSub-category: ${subCategory}\nresource_template_id: ${resourceTemplateId}\nservice_activity: ${serviceActivity}`;
    const maxTokens = existingKT ? 12000 : 16000;
    return this.callAnthropic(systemPrompt, userMessage, maxTokens, existingKT ? `activity-${serviceActivity}` : 'full');
  }

  // ── Step 1: Variants only ────────────────────────────────────────────────────
  async generateVariants(input: GenerateStepInput): Promise<any> {
    const { equipmentName, subCategory, resourceTemplateId } = input;
    if (!this.anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const systemPrompt = this.loadSkill('kt-variants-generator.md');
    const userMessage = `Generate variants for:\nEquipment: ${equipmentName}\nSub-category: ${subCategory}\nresource_template_id: ${resourceTemplateId}`;
    return this.callAnthropic(systemPrompt, userMessage, 2000, 'step1-variants');
  }

  // ── Step 2: Spare parts / consumables + variant map ─────────────────────────
  async generateSpareParts(input: GenerateStepInput): Promise<any> {
    const { equipmentName, subCategory, resourceTemplateId, layer = 'equipment', variants = [] } = input;
    if (!this.anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const skillFile = layer === 'facility' ? 'kt-facility-spare-parts-generator.md' : 'kt-spare-parts-generator.md';
    const systemPrompt = this.loadSkill(skillFile);
    const variantsContext = variants.map(v => `  - id: "${v.id}"  name: "${v.name}"${v.capacity_range ? `  range: "${v.capacity_range}"` : ''}`).join('\n');
    const userMessage = `Generate spare parts for:\nEquipment: ${equipmentName}\nSub-category: ${subCategory}\nresource_template_id: ${resourceTemplateId}\n\nVariants (use EXACT UUIDs in spare_part_variant_map):\n${variantsContext}`;
    return this.callAnthropic(systemPrompt, userMessage, 10000, 'step2-spare-parts');
  }

  // ── Step 3: Checkpoints + values only (no service_cycles) ───────────────────
  async generateCheckpoints(input: GenerateStepInput): Promise<any> {
    const { equipmentName, subCategory, resourceTemplateId, serviceActivity = 'pm', layer = 'equipment', variants = [] } = input;
    if (!this.anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const skillFile = layer === 'facility' ? 'kt-facility-checkpoints-generator.md' : 'kt-checkpoints-generator.md';
    const systemPrompt = this.loadSkill(skillFile, { '\\{\\{SERVICE_ACTIVITY\\}\\}': serviceActivity });
    const variantsContext = variants.map(v => `  - id: "${v.id}"  name: "${v.name}"${v.capacity_range ? `  range: "${v.capacity_range}"` : ''}`).join('\n');
    const userMessage = `Generate checkpoints for:\nEquipment: ${equipmentName}\nSub-category: ${subCategory}\nresource_template_id: ${resourceTemplateId}\nservice_activity: ${serviceActivity}\n\nVariants (for reference):\n${variantsContext}`;
    return this.callAnthropic(systemPrompt, userMessage, 8000, `step3-checkpoints-${serviceActivity}`);
  }

  // ── Step 4: Service cycles only ──────────────────────────────────────────────
  // Receives real checkpoint UUIDs already saved in DB — uses them directly.
  async generateServiceCycles(input: GenerateStepInput): Promise<any> {
    const { equipmentName, subCategory, resourceTemplateId, serviceActivity = 'pm', checkpoints = [] } = input;
    if (!this.anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const systemPrompt = this.loadSkill('kt-service-cycles-generator.md');
    const checkpointsContext = checkpoints
      .map(cp => `  - id: "${cp.id}"  name: "${cp.name}"  section: "${cp.section_name}"`)
      .join('\n');
    const userMessage = `Generate service cycles for:\nEquipment: ${equipmentName}\nSub-category: ${subCategory}\nresource_template_id: ${resourceTemplateId}\nservice_activity: ${serviceActivity}\n\nCheckpoints already in DB (use EXACT UUIDs in checkpoint_id):\n${checkpointsContext}`;
    return this.callAnthropic(systemPrompt, userMessage, 4000, `step4-cycles-${serviceActivity}`);
  }

  // ── Option A: Generate service_name per section from existing checkpoints ────
  // Sends checkpoint names grouped by section → returns [{ section_name, service_name }].
  // Edge then patches only service_name column — no wipe, no data loss.
  async generateServiceNames(input: GenerateServiceNamesInput): Promise<any> {
    const { equipmentName, subCategory, resourceTemplateId, checkpoints } = input;
    if (!this.anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const systemPrompt = this.loadSkill('kt-service-names-generator.md');

    // Group checkpoints by section for a compact prompt
    const bySection: Record<string, string[]> = {};
    for (const cp of checkpoints) {
      if (!bySection[cp.section_name]) bySection[cp.section_name] = [];
      bySection[cp.section_name].push(cp.name);
    }
    const sectionsContext = Object.entries(bySection)
      .map(([sec, names]) => `  section: "${sec}"\n    checkpoints: ${names.map(n => `"${n}"`).join(', ')}`)
      .join('\n');

    const userMessage = `Generate service names for:\nEquipment: ${equipmentName}\nSub-category: ${subCategory}\nresource_template_id: ${resourceTemplateId}\n\nCheckpoints by section:\n${sectionsContext}`;
    return this.callAnthropic(systemPrompt, userMessage, 2000, 'service-names');
  }

  // ── Step 5: Pricing — geo + currency aware, min/median/max ──────────────────
  // Receives real spare part and service cycle IDs already saved in DB.
  async generatePricing(input: GeneratePricingInput): Promise<any> {
    const { equipmentName, subCategory, resourceTemplateId, currency = 'INR', geo = 'IN', spareParts = [], serviceCycles = [] } = input;
    if (!this.anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const systemPrompt = this.loadSkill('kt-pricing-generator.md');

    const partsContext = spareParts
      .map(sp => `  - id: "${sp.id}"  name: "${sp.name}"  group: "${sp.component_group}"`)
      .join('\n');
    const cyclesContext = serviceCycles
      .map(sc => `  - id: "${sc.id}"  name: "${sc.catalog_name || sc.checkpoint_name || 'unnamed'}"  frequency: ${sc.frequency_value} ${sc.frequency_unit}`)
      .join('\n');

    const userMessage = `Generate pricing for:\nEquipment: ${equipmentName}\nSub-category: ${subCategory}\nresource_template_id: ${resourceTemplateId}\nCurrency: ${currency}\nGeography: ${geo}\n\nSpare Parts (use EXACT IDs):\n${partsContext}\n\nService Cycles (use EXACT IDs):\n${cyclesContext}`;
    return this.callAnthropic(systemPrompt, userMessage, 6000, `step5-pricing-${geo}-${currency}`);
  }
}

export const knowledgeTreeGeneratorService = new KnowledgeTreeGeneratorService();
