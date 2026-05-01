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

class KnowledgeTreeGeneratorService {
  private readonly anthropicKey: string;
  private readonly model: string;

  constructor() {
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    this.model = process.env.KT_LLM_MODEL || 'claude-sonnet-4-6';
    if (!this.anthropicKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set — KnowledgeTreeGeneratorService disabled');
    } else {
      console.log(`✅ KnowledgeTreeGeneratorService: Initialized (model: ${this.model})`);
    }
  }

  private loadSkillPrompt(serviceActivity: string, existingKT: boolean): string {
    const fileName = existingKT ? 'kt-activity-generator.md' : 'kt-equipment-generator.md';
    const skillPath = path.join(process.cwd(), 'src', 'skills', fileName);
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill file not found at: ${skillPath}`);
    }
    const content = fs.readFileSync(skillPath, 'utf-8');
    return content.replace(/\{\{SERVICE_ACTIVITY\}\}/g, serviceActivity);
  }

  async generate(input: GenerateKTInput): Promise<any> {
    const { equipmentName, subCategory, resourceTemplateId, serviceActivity = 'pm', existingKT = false } = input;

    if (!this.anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured in .env');
    }

    const systemPrompt = this.loadSkillPrompt(serviceActivity, existingKT);

    const userMessage = `Generate a ${existingKT ? '' : 'complete '}Knowledge Tree for:
Equipment: ${equipmentName}
Sub-category: ${subCategory}
resource_template_id: ${resourceTemplateId}
service_activity: ${serviceActivity}`;

    // Activity-only prompt is focused (no variants/parts) — needs far fewer tokens
    const maxTokens = existingKT ? 12000 : 16000;

    console.log(`🤖 KT Generate: "${equipmentName}" | activity: ${serviceActivity} | mode: ${existingKT ? 'activity-only' : 'full'} | maxTokens: ${maxTokens}`);

    let response;
    try {
      response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.model,
          max_tokens: maxTokens,
          // System as array enables prompt caching — saves ~90% of input token cost
          // on repeated calls since the skill prompt is identical across all generations
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
      console.log(`📊 Tokens — in: ${usage.input_tokens} (cached: ${usage.cache_read_input_tokens ?? 0}), out: ${usage.output_tokens}, stop: ${stopReason}`);
    }
    if (stopReason === 'max_tokens') {
      console.warn(`⚠️ KT response hit max_tokens (${maxTokens}) — output may be truncated`);
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

    try {
      return JSON.parse(jsonText);
    } catch {
      console.warn('⚠️ KT JSON has syntax errors — attempting repair...');
      try {
        const repaired = jsonrepair(jsonText);
        const result = JSON.parse(repaired);
        console.log('✅ KT JSON repaired successfully');
        return result;
      } catch (repairErr: any) {
        console.error('❌ KT JSON repair failed:', repairErr.message);
        throw new Error(`KT generation produced invalid JSON: ${repairErr.message}`);
      }
    }
  }
}

export const knowledgeTreeGeneratorService = new KnowledgeTreeGeneratorService();
