// src/services/overlaysGeneratorService.ts
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { jsonrepair } from 'jsonrepair';

interface OverlayInput {
  equipmentName: string;
  subCategory: string;
  resourceTemplateId: string;
}

interface ContextOverlay {
  id: string;
  context_type: string;
  context_value: string;
  adjustments: {
    frequency_multiplier: number;
    affected_checkpoints: string[];
    additional_actions: string[];
    threshold_adjustments: Record<string, any>;
    notes: string;
  };
  priority: number;
  is_active: boolean;
}

class OverlaysGeneratorService {
  private readonly anthropicKey: string;
  private readonly anthropicUrl: string;
  private readonly model: string;

  constructor() {
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    this.anthropicUrl = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
    this.model = process.env.KT_LLM_MODEL || 'claude-sonnet-4-6';
  }

  private loadPrompt(): string {
    const skillPath = path.join(process.cwd(), 'src', 'skills', 'kt-overlays-generator.md');
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Overlays generator skill file not found at: ${skillPath}`);
    }
    return fs.readFileSync(skillPath, 'utf-8');
  }

  async generate(input: OverlayInput): Promise<ContextOverlay[]> {
    if (!this.anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const systemPrompt = this.loadPrompt();
    const userMessage = `Generate context overlays for:
Equipment: ${input.equipmentName}
Sub-category: ${input.subCategory}
resource_template_id: ${input.resourceTemplateId}`;

    const maxTokens = 3000;
    console.log(`🌐 Overlays Generate: "${input.equipmentName}" | maxTokens: ${maxTokens}`);

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
          timeout: 120000,
        }
      );
    } catch (axiosErr: any) {
      const status = axiosErr.response?.status;
      const body = axiosErr.response?.data;
      console.error(`❌ Anthropic overlays error (${status}):`, JSON.stringify(body));
      throw new Error(body?.error?.message || axiosErr.message);
    }

    const stopReason: string = response.data?.stop_reason;
    const rawText: string = response.data?.content?.[0]?.text;
    const usage = response.data?.usage;

    if (usage) {
      console.log(`📊 Overlays tokens — in: ${usage.input_tokens} (cached: ${usage.cache_read_input_tokens ?? 0}), out: ${usage.output_tokens}, stop: ${stopReason}`);
    }

    if (!rawText) throw new Error('Empty response from Anthropic API');

    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON found in overlays response');
    }

    const jsonText = rawText.substring(firstBrace, lastBrace + 1);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      try {
        parsed = JSON.parse(jsonrepair(jsonText));
      } catch (err: any) {
        throw new Error(`Overlays generation produced invalid JSON: ${err.message}`);
      }
    }

    const overlays: ContextOverlay[] = parsed.context_overlays || [];
    console.log(`✅ Overlays generated: ${overlays.length} for "${input.equipmentName}"`);
    return overlays;
  }
}

export const overlaysGeneratorService = new OverlaysGeneratorService();
