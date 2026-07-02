// ============================================================================
// VaNi LLM smoke test — proves the Phase-0 plumbing end to end:
//   1. vaniLLMClient reaches the Qwen endpoint and returns valid JSON
//   2. vaniInteractionLogger writes the call to vn_interaction_log (via RPC)
//   3. feedback update lands on the same row
//
// Requires env (in contractnest-api/.env):
//   VANI_LLM_URL, VANI_LLM_API_KEY          — the Qwen endpoint
//   SUPABASE_URL, SUPABASE_KEY              — already set for the API
// Requires the vani-agent/001 migration to be applied (for steps 2–3;
// step 1 works without it).
//
// Run:  npx ts-node -r dotenv/config src/__tests__/vaniLLMSmoke.ts
// Verify rows in Supabase: select * from vn_interaction_log order by created_at desc;
// ============================================================================

import vaniLLMClient from '../services/vaniLLMClient';
import vaniInteractionLogger from '../services/vaniInteractionLogger';

async function main() {
  if (!vaniLLMClient.isEnabled()) {
    console.error('❌ VANI_LLM_URL not set — add it to contractnest-api/.env');
    process.exit(1);
  }

  console.log('1️⃣  Calling Qwen with a structured test prompt...');

  const { parsed, interactionId, latencyMs, completionTokens } =
    await vaniInteractionLogger.loggedJSONCall<{ intent: string; buyer: string; term_months: number }>(
      {
        skill: 'smoke_test:intent_parse',
        contextPayload: { note: 'phase-0 plumbing smoke test' },
      },
      'You parse contract requests into JSON. Respond with ONLY a JSON object with keys: intent (string), buyer (string), term_months (number). No prose.',
      'Create a 1 year AMC contract for Kamal Industries',
      { maxTokens: 120 }
    );

  console.log(`✅ LLM responded in ${latencyMs}ms (${completionTokens} tokens):`);
  console.log(JSON.stringify(parsed, null, 2));

  if (!parsed || typeof parsed !== 'object') {
    console.error('❌ Response was not a JSON object');
    process.exit(1);
  }

  console.log(`2️⃣  Interaction logged with id ${interactionId} (fire-and-forget)`);

  console.log('3️⃣  Recording was_accepted=true feedback on the same row...');
  vaniInteractionLogger.recordFeedback(interactionId, { wasAccepted: true, userRating: 5 });

  // Give the fire-and-forget RPCs a moment to land before the process exits
  await new Promise((r) => setTimeout(r, 3000));

  console.log('✅ Smoke test done.');
  console.log('   Verify in Supabase SQL editor:');
  console.log(`   select id, context_payload->>'skill' as skill, was_accepted, user_rating, latency_ms from vn_interaction_log where id = '${interactionId}';`);
}

main().catch((err) => {
  console.error('❌ Smoke test failed:', err.message);
  process.exit(1);
});
