// Calls Claude for the app. The API key lives only in Cloudflare (secret ANTHROPIC_API_KEY) — never in the browser.
// Every call is logged in ai_usage (app, feature, tokens, cost) for usage tracking.
import { uid } from './util.js';

export const APP_NAME = 'pretty-studio';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
// USD per million tokens [input, output] — keep in step with https://platform.claude.com/docs/en/about-claude/pricing
const PRICES = { 'claude-sonnet-5-5': [2, 10], 'claude-haiku-4-5-20251001': [1, 5], 'claude-opus-5-5': [4, 20] };

export async function logUsage(env, row) {
  try {
    await env.DB.prepare('INSERT INTO ai_usage (id, app, feature, model, input_tokens, output_tokens, cost_usd, user, ok, error) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(uid(), APP_NAME, row.feature, row.model, row.input || 0, row.output || 0, row.cost || 0, row.user || null, row.ok ? 1 : 0, row.error || null).run();
  } catch { /* logging must never break the feature */ }
}

// content: array of Claude content blocks; tool: {name, description, input_schema}
export async function callTool(env, { feature, user, system, content, tool, maxTokens = 4000 }) {
  const model = env.AI_MODEL || DEFAULT_MODEL;
  if (env.AI_MOCK) { const out = JSON.parse(env.AI_MOCK); await logUsage(env, { feature, model: 'mock', user, ok: true }); return out; }
  if (!env.ANTHROPIC_API_KEY) throw new Error('AI is not set up yet — add the ANTHROPIC_API_KEY secret in Cloudflare.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content }] })
  });
  const data = await res.json().catch(() => ({}));
  const inT = data.usage?.input_tokens || 0, outT = data.usage?.output_tokens || 0, p = PRICES[model] || PRICES[DEFAULT_MODEL];
  const cost = (inT * p[0] + outT * p[1]) / 1e6;
  if (!res.ok) {
    const msg = data.error?.message || `AI service error (${res.status})`;
    await logUsage(env, { feature, model, user, input: inT, output: outT, cost, ok: false, error: msg.slice(0, 300) });
    throw new Error(res.status === 401 ? 'The AI key was rejected — check ANTHROPIC_API_KEY in Cloudflare.' : res.status === 429 || res.status === 529 ? 'The AI service is busy — try again in a minute.' : msg);
  }
  await logUsage(env, { feature, model, user, input: inT, output: outT, cost, ok: true });
  const block = (data.content || []).find(b => b.type === 'tool_use');
  if (!block) throw new Error('The AI could not read that document.');
  return block.input;
}
