// Calls Claude for the app. The API key lives only in Cloudflare (secret ANTHROPIC_API_KEY) — never in the browser.
// Every call is logged in ai_usage (app, feature, tokens, cost) for usage tracking.
import { uid } from './util.js';
import { reportUsageMonth } from './ai-reporting.js';

export const APP_NAME = 'pretty-studio';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
// USD per million tokens [input, output] — keep in step with https://platform.claude.com/docs/en/about-claude/pricing
const PRICES = { 'claude-sonnet-5-5': [2, 10], 'claude-haiku-4-5-20251001': [1, 5] };
// Models the owner may choose in Settings (Opus deliberately not offered)
export const MODELS = { 'claude-sonnet-5-5': 'Sonnet 5.5 — most accurate', 'claude-haiku-4-5-20251001': 'Haiku 4.5 — cheapest & fastest' };
async function chosenModel(env) {
  try { const r = await env.DB.prepare("SELECT value FROM settings WHERE key='ai'").first(); const m = r && JSON.parse(r.value).model; if (MODELS[m]) return m; } catch { }
  return MODELS[env.AI_MODEL] ? env.AI_MODEL : DEFAULT_MODEL;
}

export async function logUsage(env, row) {
  try {
    await env.DB.prepare('INSERT INTO ai_usage (id, app, feature, model, input_tokens, output_tokens, cost_usd, user, ok, error) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(uid(), APP_NAME, row.feature, row.model, row.input || 0, row.output || 0, row.cost || 0, row.user || null, row.ok ? 1 : 0, row.error || null).run();
    if (row.model !== 'mock') { try { await reportUsageMonth(env); } catch { console.error('AI usage sync unavailable.'); } }
  } catch { /* logging must never break the feature */ }
}

// content: array of Claude content blocks; tool: {name, description, input_schema}
export async function callTool(env, { feature, user, system, content, tool, maxTokens = 4000 }) {
  const model = await chosenModel(env);
  if (env.AI_MOCK) { const out = JSON.parse(env.AI_MOCK); await logUsage(env, { feature, model: 'mock', user, ok: true }); return out; }
  if (!env.ANTHROPIC_API_KEY) throw new Error('AI is not set up yet — add the ANTHROPIC_API_KEY secret in Cloudflare.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: `${system}\n\nAlways answer by calling the ${tool.name} tool exactly once. Do not reply with plain text.`, tools: [tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content }] })
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
  const block = (data.content || []).find(b => b.type === 'tool_use' && b.name === tool.name);
  if (block) return block.input;
  // Fallback: the model answered in text — accept it if it contains the JSON we asked for
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { const j = JSON.parse(m[0]); if (j && Array.isArray(j.lines)) return j; } catch { } }
  throw new Error('The AI could not read that document — try a clearer photo, or paste the text.');
}

// Conversation with tools (used by "Ask a question"): Claude may call the read-only tools several times before answering.
// runTool(name, input) returns any JSON-able value. Usage for all rounds is logged as one row.
export async function chat(env, { feature, user, system, messages, tools, runTool, maxRounds = 6, maxTokens = 1500 }) {
  const model = await chosenModel(env);
  if (env.AI_MOCK) { await logUsage(env, { feature, model: 'mock', user, ok: true }); return { text: 'AI practice mode: this is a sample answer.', used: [], cost: 0 }; }
  if (!env.ANTHROPIC_API_KEY) throw new Error('AI is not set up yet — add the ANTHROPIC_API_KEY secret in Cloudflare.');
  const p = PRICES[model] || PRICES[DEFAULT_MODEL], used = [], msgs = [...messages];
  let inT = 0, outT = 0;
  const finish = async (ok, error) => { const cost = (inT * p[0] + outT * p[1]) / 1e6; await logUsage(env, { feature, model, user, input: inT, output: outT, cost, ok, error }); return cost; };
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, tools, messages: msgs })
    });
    const data = await res.json().catch(() => ({}));
    inT += data.usage?.input_tokens || 0; outT += data.usage?.output_tokens || 0;
    if (!res.ok) {
      const msg = data.error?.message || `AI service error (${res.status})`;
      await finish(false, msg.slice(0, 300));
      throw new Error(res.status === 401 ? 'The AI key was rejected — check ANTHROPIC_API_KEY in Cloudflare.' : res.status === 429 || res.status === 529 ? 'The AI service is busy — try again in a minute.' : msg);
    }
    const content = data.content || [], calls = content.filter(b => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !calls.length) {
      const cost = await finish(true);
      return { text: content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(), used, cost };
    }
    msgs.push({ role: 'assistant', content });
    const results = [];
    for (const c of calls) {
      let out, isError = false;
      try { out = await runTool(c.name, c.input || {}); } catch (e) { out = { error: e.message }; isError = true; }
      if (!used.includes(c.name)) used.push(c.name);
      results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out).slice(0, 30000), ...(isError ? { is_error: true } : {}) });
    }
    msgs.push({ role: 'user', content: results });
  }
  await finish(false, 'too many look-ups');
  throw new Error('That question needed too many look-ups — try asking something more specific.');
}
