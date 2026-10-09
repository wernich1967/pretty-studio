const REPORT_URL = 'https://eu-creations-command-centre.wernich.chatgpt.site/api/ai-usage';

export async function usageSummary(db, month) {
  const where = "strftime('%Y-%m',created_at,'+2 hours')=? AND model != 'mock'";
  const totals = await db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(ok=0),0) AS failed, COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens, COALESCE(SUM(cost_usd),0) AS costUsd, MAX(created_at) AS lastCall FROM ai_usage WHERE ${where}`).bind(month).first();
  const models = (await db.prepare(`SELECT model, COUNT(*) AS calls, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens, COALESCE(SUM(cost_usd),0) AS costUsd FROM ai_usage WHERE ${where} GROUP BY model ORDER BY calls DESC`).bind(month).all()).results;
  if (totals.lastCall) totals.lastCall = new Date(totals.lastCall.replace(' ', 'T') + (totals.lastCall.endsWith('Z') ? '' : 'Z')).toISOString();
  return { ...totals, unpricedCalls: 0, models };
}

export async function reportingStatus(env) {
  const row = await env.DB.prepare('SELECT token,last_synced_at FROM ai_reporting WHERE id=1').first();
  return { connected: !!row?.token, lastSyncedAt: row?.last_synced_at || null };
}

export async function reportUsageMonth(env, month = new Date(Date.now() + 7200000).toISOString().slice(0, 7)) {
  const row = await env.DB.prepare('SELECT token FROM ai_reporting WHERE id=1').first();
  if (!row?.token) return false;
  // Capture time before the reads: an older concurrent report cannot overwrite a newer one.
  const capturedAt = new Date().toISOString();
  const totals = await usageSummary(env.DB, month);
  const response = await fetch(REPORT_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${row.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, capturedAt, totals }), redirect: 'manual', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('EU Digital could not receive the usage update.');
  await env.DB.prepare('UPDATE ai_reporting SET last_synced_at=? WHERE id=1').bind(new Date().toISOString()).run();
  return true;
}

export async function syncHistory(env) {
  const months = (await env.DB.prepare("SELECT DISTINCT strftime('%Y-%m',created_at,'+2 hours') AS month FROM ai_usage WHERE model != 'mock' ORDER BY month DESC LIMIT 120").all()).results.map(r => r.month);
  const current = new Date(Date.now() + 7200000).toISOString().slice(0, 7);
  for (const month of new Set([current, ...months])) await reportUsageMonth(env, month);
}

export async function connectReporting(env, code) {
  if (typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code.trim())) throw new Error('Paste the connection code from EU Digital.');
  const response = await fetch(`${REPORT_URL}/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }), redirect: 'manual', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('The code has expired or was already used. Generate a new one in EU Digital.');
  const data = await response.json();
  if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error('The reporting connection could not be established.');
  await env.DB.prepare('INSERT INTO ai_reporting (id,token) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,last_synced_at=NULL').bind(data.token).run();
  await syncHistory(env);
}
