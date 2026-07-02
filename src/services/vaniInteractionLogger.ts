// ============================================================================
// VaNi Interaction Logger
// ============================================================================
// Purpose: Capture every VaNi LLM interaction into vn_interaction_log —
//          the training-data flywheel (Vikuna LLM Strategy v1.0 §3–4).
//          Every useful response + every user edit/acceptance is a future
//          fine-tuning example. Logged from the first call, not retrofitted.
//
// Pattern: same as auditService — anon-key Supabase client calling
//          SECURITY DEFINER RPCs (the API has no service-role key; the table
//          itself is RLS-locked with no policies, so the RPCs are the only
//          write path).
//
// Logging is fire-and-forget: a logging failure must NEVER fail the
// user-facing operation. Errors are logged and swallowed.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import vaniLLMClient, { VaniLLMOptions, VaniLLMJSONResult } from './vaniLLMClient';

export interface VaniInteractionContext {
  tenantId?: string;
  sessionId?: string;
  userId?: string;
  /** e.g. 'contract_composer:intent_parse' — maps to the strategy doc's context "skill" */
  skill: string;
  /** Compact structured context sent to the model (logged for fine-tuning) */
  contextPayload?: Record<string, any>;
}

export interface VaniFeedback {
  userRating?: number;          // 1–5
  wasEdited?: boolean;
  editedResponse?: string;      // gold standard when the user corrected the output
  wasAccepted?: boolean;        // user acted on the response
  followUpQuery?: string;       // signals confusion / dissatisfaction
}

class VaniInteractionLogger {
  private supabase: SupabaseClient | null = null;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY; // anon key — writes go through SECURITY DEFINER RPCs

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ VaniInteractionLogger: SUPABASE_URL/SUPABASE_KEY missing — interaction logging disabled');
      return;
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  isEnabled(): boolean {
    return this.supabase !== null;
  }

  /**
   * Log one LLM interaction. Returns the interaction id (generated
   * client-side so feedback can reference it even though the insert is
   * fire-and-forget). Never throws.
   */
  logInteraction(params: {
    context: VaniInteractionContext;
    systemPrompt: string;
    userInput: string;
    llmResponse: string;
    modelVersion: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
  }): string {
    const id = uuidv4();
    if (!this.supabase) return id;

    const { context } = params;
    this.supabase
      .rpc('log_vani_interaction', {
        p_id: id,
        p_product: 'contractnest',
        p_tenant_id: context.tenantId || null,
        p_session_id: context.sessionId || null,
        p_user_id: context.userId || null,
        p_system_prompt: params.systemPrompt,
        p_user_input: params.userInput,
        p_context_payload: { skill: context.skill, ...(context.contextPayload || {}) },
        p_llm_response: params.llmResponse,
        p_model_version: params.modelVersion,
        p_prompt_tokens: params.promptTokens ?? null,
        p_completion_tokens: params.completionTokens ?? null,
        p_latency_ms: params.latencyMs ?? null,
        p_endpoint: process.env.VANI_LLM_URL || null,
      })
      .then(({ error }) => {
        if (error) console.error('❌ VaniInteractionLogger insert failed:', error.message);
      });

    return id;
  }

  /**
   * Record quality signals on a previously logged interaction
   * (thumbs, edit-before-send, accept-and-act). Never throws.
   */
  recordFeedback(interactionId: string, feedback: VaniFeedback): void {
    if (!this.supabase) return;

    this.supabase
      .rpc('vani_interaction_feedback', {
        p_id: interactionId,
        p_user_rating: feedback.userRating ?? null,
        p_was_edited: feedback.wasEdited ?? null,
        p_edited_response: feedback.editedResponse ?? null,
        p_was_accepted: feedback.wasAccepted ?? null,
        p_follow_up_query: feedback.followUpQuery ?? null,
      })
      .then(({ error }) => {
        if (error) console.error('❌ VaniInteractionLogger feedback failed:', error.message);
      });
  }

  /**
   * The standard way to make a VaNi LLM call: completeJSON + automatic
   * logging. Returns the parse result plus the interactionId for later
   * feedback (was_edited / was_accepted).
   */
  async loggedJSONCall<T = any>(
    context: VaniInteractionContext,
    systemPrompt: string,
    userMessage: string,
    options: VaniLLMOptions = {}
  ): Promise<VaniLLMJSONResult<T> & { interactionId: string }> {
    const result = await vaniLLMClient.completeJSON<T>(systemPrompt, userMessage, {
      label: context.skill,
      ...options,
    });

    const interactionId = this.logInteraction({
      context,
      systemPrompt,
      userInput: userMessage,
      llmResponse: result.content,
      modelVersion: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
    });

    return { ...result, interactionId };
  }
}

export const vaniInteractionLogger = new VaniInteractionLogger();
export default vaniInteractionLogger;
