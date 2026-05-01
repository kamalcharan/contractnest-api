// src/services/complianceTaggerService.ts
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { jsonrepair } from 'jsonrepair';

interface CheckpointInput {
  id: string;
  name: string;
  section_name?: string;
  service_activity?: string;
}

interface ComplianceTag {
  checkpoint_id: string;
  compliance_standard: string | null;
  is_mandatory: boolean;
}

interface TaggerInput {
  equipmentName: string;
  subCategory: string;
  checkpoints: CheckpointInput[];
}

class ComplianceTaggerService {
  private readonly anthropicKey: string;
  private readonly anthropicUrl: string;
  private readonly model: string;

  constructor() {
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    this.anthropicUrl = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
    this.model = process.env.KT_LLM_MODEL || 'claude-sonnet-4-6';
  }

  private loadPrompt(): string {
    const skillPath = path.join(process.cwd(), 'src', 'skills', 'kt-compliance-tagger.md');
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Compliance tagger skill file not found at: ${skillPath}`);
    }
    return fs.readFileSync(skillPath, 'utf-8');
  }

  async tag(input: TaggerInput): Promise<ComplianceTag[]> {
    if (!this.anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const systemPrompt = this.loadPrompt();

    const userMessage = `Tag compliance standards for:
Equipment: ${input.equipmentName}
Sub-category: ${input.subCategory}

Checkpoints:
${JSON.stringify(input.checkpoints, null, 2)}`;

    // Compliance tagging is a small focused task — 4K output is plenty
    const maxTokens = 4000;

    console.log(`🔖 Compliance tagging: "${input.equipmentName}" — ${input.checkpoints.length} checkpoints`);

    let response;
    try {
      response = await axios.post(
        this.anthropicUrl,
        {
          model: this.model,
          max_tokens: maxTokens,
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
          timeout: 120000,
        }
      );
    } catch (axiosErr: any) {
      const status = axiosErr.response?.status;
      const body = axiosErr.response?.data;
      console.error(`❌ Anthropic compliance tagging error (${status}):`, JSON.stringify(body));
      throw new Error(body?.error?.message || axiosErr.message);
    }

    const rawText: string = response.data?.content?.[0]?.text;
    const usage = response.data?.usage;

    if (usage) {
      console.log(`📊 Compliance tag tokens — in: ${usage.input_tokens} (cached: ${usage.cache_read_input_tokens ?? 0}), out: ${usage.output_tokens}`);
    }

    if (!rawText) {
      throw new Error('Empty response from Anthropic API');
    }

    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in compliance tagger response');
    }

    const jsonText = rawText.substring(firstBrace, lastBrace + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      try {
        parsed = JSON.parse(jsonrepair(jsonText));
      } catch (repairErr: any) {
        throw new Error(`Compliance tagging produced invalid JSON: ${repairErr.message}`);
      }
    }

    const tags: ComplianceTag[] = parsed.tags || [];
    console.log(`✅ Compliance tagged: ${tags.filter((t) => t.compliance_standard).length}/${tags.length} checkpoints have standards`);
    return tags;
  }
}

export const complianceTaggerService = new ComplianceTaggerService();
