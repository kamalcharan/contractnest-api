// ============================================================================
// VaNi LLM Client
// ============================================================================
// Purpose: Single gateway for all VaNi agent LLM calls.
//          Talks to the self-hosted Qwen endpoint (llama.cpp server,
//          OpenAI-compatible /v1/chat/completions) — swappable to Qwen3-8B
//          or Vikuna-LLM via env, no code change.
//
// Design rules (see ClaudeDocumentation/ContractNest Agent/POA-AGENTIC-CONTRACTS.md):
//   - Small, schema-shaped JSON calls only — the LLM never free-generates
//     a contract; it makes bounded decisions inside a deterministic pipeline.
//   - '/no_think' is always appended to the system prompt (suppresses
//     chain-of-thought tokens on Qwen3 — required for structured output).
//   - Callers must degrade gracefully: check isEnabled(), catch errors,
//     and fall back to deterministic behaviour when the LLM is unavailable.
//   - Every call through this client should be logged via
//     vaniInteractionLogger (the loggedJSONCall helper there wraps this).
//
// Env:
//   VANI_LLM_URL         e.g. https://llm.dristiq.io/v1/chat/completions
//   VANI_LLM_API_KEY     bearer token
//   VANI_LLM_MODEL       any string (llama.cpp ignores it); used for logging
//   VANI_LLM_TIMEOUT_MS  default 90000 (CPU inference is seconds, not ms)
// ============================================================================

import axios from 'axios';
import { jsonrepair } from 'jsonrepair';

export interface VaniLLMOptions {
  maxTokens?: number;      // default 300 — structured outputs stay small
  temperature?: number;    // default 0.3 — factual/structured
  label?: string;          // for logs, e.g. 'composer:intent-parse'
  timeoutMs?: number;      // per-call override (CPU inference on long prompts)
}

export interface VaniLLMResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  model: string;
}

export interface VaniLLMJSONResult<T = any> extends VaniLLMResult {
  parsed: T;
}

const DEFAULT_MAX_TOKENS = 300;
const DEFAULT_TEMPERATURE = 0.3;

class VaniLLMClient {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor() {
    this.url = process.env.VANI_LLM_URL || '';
    this.apiKey = process.env.VANI_LLM_API_KEY || '';
    this.model = process.env.VANI_LLM_MODEL || 'qwen3-4b-q4km';
    this.timeoutMs = parseInt(process.env.VANI_LLM_TIMEOUT_MS || '90000', 10);

    if (!this.url) {
      console.warn('⚠️ VANI_LLM_URL not set — VaniLLMClient disabled (agent flows degrade to deterministic-only)');
    } else {
      console.log(`✅ VaniLLMClient: ${this.url} model=${this.model}`);
    }
  }

  /** True when the LLM endpoint is configured. Callers must check and degrade. */
  isEnabled(): boolean {
    return !!this.url;
  }

  /** Model identifier used for vn_interaction_log.model_version */
  getModelVersion(): string {
    return this.model;
  }

  /**
   * Plain chat completion. Appends '/no_think' to the system prompt.
   * One retry on network/5xx errors.
   */
  async complete(
    systemPrompt: string,
    userMessage: string,
    options: VaniLLMOptions = {}
  ): Promise<VaniLLMResult> {
    if (!this.isEnabled()) {
      throw new Error('VaniLLMClient not configured (VANI_LLM_URL missing)');
    }

    const label = options.label || 'vani';
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: `${systemPrompt} /no_think` },
        { role: 'user', content: userMessage },
      ],
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    };

    const callTimeout = options.timeoutMs ?? this.timeoutMs;
    const started = Date.now();
    let response;
    try {
      response = await this.post(body, callTimeout);
    } catch (firstErr: any) {
      const status = firstErr.response?.status;
      const retryable = !status || status >= 500;
      if (!retryable) {
        console.error(`❌ VaniLLM [${label}] error (${status}):`, firstErr.response?.data || firstErr.message);
        throw new Error(`VaniLLM call failed: ${firstErr.message}`);
      }
      console.warn(`⚠️ VaniLLM [${label}] retrying after error: ${firstErr.message}`);
      await new Promise((r) => setTimeout(r, 2000));
      response = await this.post(body, callTimeout);
    }
    const latencyMs = Date.now() - started;

    const choice = response.data?.choices?.[0];
    const content: string = (choice?.message?.content || '').trim();
    const usage = response.data?.usage || {};

    if (!content) throw new Error(`VaniLLM [${label}] returned empty content`);
    if (choice?.finish_reason === 'length') {
      console.warn(`⚠️ VaniLLM [${label}] hit max_tokens — output may be truncated`);
    }

    console.log(`📊 VaniLLM [${label}] in: ${usage.prompt_tokens ?? '?'}, out: ${usage.completion_tokens ?? '?'}, ${latencyMs}ms`);

    return {
      content,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      latencyMs,
      model: this.model,
    };
  }

  /**
   * Structured completion: expects the model to answer with a single JSON
   * object. Extracts and parses it (jsonrepair fallback, same approach as
   * knowledgeTreeGeneratorService).
   */
  async completeJSON<T = any>(
    systemPrompt: string,
    userMessage: string,
    options: VaniLLMOptions = {}
  ): Promise<VaniLLMJSONResult<T>> {
    const result = await this.complete(systemPrompt, userMessage, options);
    const label = options.label || 'vani';

    const firstBrace = result.content.indexOf('{');
    const lastBrace = result.content.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error(`VaniLLM [${label}] no JSON object in response`);
    }

    const jsonText = result.content.substring(firstBrace, lastBrace + 1);
    let parsed: T;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      try {
        parsed = JSON.parse(jsonrepair(jsonText));
        console.log(`✅ VaniLLM [${label}] JSON repaired`);
      } catch (e: any) {
        throw new Error(`VaniLLM [${label}] invalid JSON: ${e.message}`);
      }
    }

    return { ...result, parsed };
  }

  private post(body: Record<string, any>, timeoutMs?: number) {
    return axios.post(this.url, body, {
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      timeout: timeoutMs ?? this.timeoutMs,
    });
  }
}

// Singleton (matches service pattern used across contractnest-api)
export const vaniLLMClient = new VaniLLMClient();
export default vaniLLMClient;
