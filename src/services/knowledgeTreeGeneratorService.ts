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
  resourceType?: 'equipment' | 'facility';
}

interface GenerateKTResult {
  data: any;
  truncated: boolean;
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
      console.log(`✅ KnowledgeTreeGeneratorService: model=${this.model}, url=${this.anthropicUrl}`);
    }
  }

  // Selects the correct skill file based on generation mode and resource type.
  // Skill files are cached by the OS file system; prompt caching is handled
  // at the Anthropic API level via cache_control on the system message.
  private loadSkillPrompt(serviceActivity: string, existingKT: boolean, resourceType: string): string {
    let fileName: string;
    if (existingKT) {
      fileName = 'kt-activity-generator.md';
    } else if (resourceType === 'facility') {
      fileName = 'kt-facility-generator.md';
    } else {
      fileName = 'kt-equipment-generator.md';
    }

    const skillPath = path.join(process.cwd(), 'src', 'skills', fileName);
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill file not found at: ${skillPath}`);
    }
    const content = fs.readFileSync(skillPath, 'utf-8');
    return content.replace(/\{\{SERVICE_ACTIVITY\}\}/g, serviceActivity);
  }

  // Token budget per generation mode:
  //   activity-only  — 12 000  (checkpoints + cycles only, no variants/parts)
  //   facility full  — 28 000  (zones + consumables + checkpoints + cycles + overlays + checkpoint_values + spare_part_variant_map)
  //   equipment full — 16 000  (variants + 40+ parts + spare_part_variant_map up to 100 entries)
  private getMaxTokens(existingKT: boolean, resourceType: string): number {
    if (existingKT) return 12_000;
    // Hospital Ward / OT can produce 28 checkpoints × 3 values + 80-entry spare_part_variant_map
    if (resourceType === 'facility') return 28_000;
    return 16_000;
  }

  async generate(input: GenerateKTInput): Promise<GenerateKTResult> {
    const {
      equipmentName,
      subCategory,
      resourceTemplateId,
      serviceActivity = 'pm',
      existingKT = false,
      resourceType = 'equipment',
    } = input;

    if (!this.anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured in .env');
    }

    const systemPrompt = this.loadSkillPrompt(serviceActivity, existingKT, resourceType);
    const maxTokens = this.getMaxTokens(existingKT, resourceType);

    // Label used in the user turn — facilities get "Facility:" prefix, equipment keeps "Equipment:"
    const resourceLabel = resourceType === 'facility' ? 'Facility' : 'Equipment';

    const userMessage = existingKT
      ? `Generate a Knowledge Tree activity plan for:
Equipment: ${equipmentName}
Sub-category: ${subCategory}
resource_template_id: ${resourceTemplateId}
service_activity: ${serviceActivity}`
      : `Generate a complete Knowledge Tree for:
${resourceLabel}: ${equipmentName}
Sub-category: ${subCategory}
resource_template_id: ${resourceTemplateId}
service_activity: ${serviceActivity}`;

    console.log(
      `🤖 KT Generate: "${equipmentName}" | type: ${resourceType} | activity: ${serviceActivity} | ` +
      `mode: ${existingKT ? 'activity-only' : 'full'} | maxTokens: ${maxTokens}`
    );

    let response;
    try {
      response = await axios.post(
        this.anthropicUrl,
        {
          model: this.model,
          max_tokens: maxTokens,
          // Prompt caching on the system message — the skill file is identical across all
          // calls of the same type, so Anthropic caches it after the first call.
          // Saves ~90% of input token cost on repeated generations.
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: userMessage }],
        },
        {
          headers: {
            'x-api-key': this.anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
            'content-type': 'application/json',
          },
          timeout: 300_000, // 5 min — LLM generation takes 60–180s for a full KT
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
    const truncated = stopReason === 'max_tokens';

    if (usage) {
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const cacheWrite = usage.cache_creation_input_tokens ?? 0;
      const cacheHit = cacheRead > 0;
      console.log(
        `📊 Tokens — in: ${usage.input_tokens} (cache_read: ${cacheRead}, cache_write: ${cacheWrite}), ` +
        `out: ${usage.output_tokens}, stop: ${stopReason}${cacheHit ? ' ✅ cache hit' : ' 🔄 cache miss'}`
      );
    }

    if (truncated) {
      console.warn(
        `⚠️ KT output hit max_tokens (${maxTokens}) for "${equipmentName}" — ` +
        `JSON may be incomplete. Attempting parse and reporting truncation flag.`
      );
    }

    if (!rawText) {
      throw new Error('Empty response from Anthropic API');
    }

    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      console.error('❌ KT raw response (first 500 chars):', rawText.substring(0, 500));
      throw new Error('No JSON object found in LLM response');
    }

    const jsonText = rawText.substring(firstBrace, lastBrace + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.warn('⚠️ KT JSON has syntax errors — attempting repair...');
      try {
        const repaired = jsonrepair(jsonText);
        parsed = JSON.parse(repaired);
        console.log('✅ KT JSON repaired successfully');
      } catch (repairErr: any) {
        console.error('❌ KT JSON repair failed:', repairErr.message);
        throw new Error(`KT generation produced invalid JSON: ${repairErr.message}`);
      }
    }

    return { data: parsed, truncated };
  }
}

export const knowledgeTreeGeneratorService = new KnowledgeTreeGeneratorService();
