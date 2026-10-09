import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { usageSummary, reportUsageMonth } from '../lib/ai-reporting.js';
import { register } from '../lib/api/ai-reporting.js';
import { MIGRATIONS } from '../lib/migrations.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) for (const sql of m.sql) sqlite.exec(sql);
  return { sqlite, env: { DB: { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = values => ({
    async first() { return stmt.get(...values) || null; },
    async all() { return { results: stmt.all(...values) }; },
    async run() { return stmt.run(...values); },
  }); return { ...bound([]), bind(...values) { return bound(values); } }; } } } };
}

test('monthly summaries use SAST, exclude mocks and never include business fields', async () => {
  const { sqlite, env } = database();
  sqlite.exec(`INSERT INTO ai_usage (id,created_at,model,input_tokens,output_tokens,cost_usd,user,error,ok) VALUES
    ('sep','2026-09-30 21:59:59','claude-sonnet-5-5',11,2,0.1,'private@example.com','private invoice',1),
    ('oct','2026-09-30 22:00:00','claude-sonnet-5-5',100,20,0.2,'private@example.com',NULL,1),
    ('fail','2026-10-01 12:00:00','claude-sonnet-5-5',50,10,0.1,NULL,'private failure',0),
    ('mock','2026-10-01 13:00:00','mock',999,999,0,NULL,NULL,1)`);
  const totals = await usageSummary(env.DB, '2026-10');
  assert.equal(totals.calls, 2);
  assert.equal(totals.failed, 1);
  assert.equal(totals.inputTokens, 150);
  assert.equal(totals.outputTokens, 30);
  assert.ok(Math.abs(totals.costUsd - 0.3) < 1e-10);
  assert.ok(!JSON.stringify(totals).includes('private'));
  assert.equal((await usageSummary(env.DB, '2026-09')).calls, 1);
});

test('reports send authenticated aggregate snapshots and update sync status', async () => {
  const { sqlite, env } = database();
  sqlite.prepare('INSERT INTO ai_reporting (id,token) VALUES (1,?)').run('test-only-report-token');
  const original = globalThis.fetch; let report;
  globalThis.fetch = async (url, init) => { report = { url, init }; return Response.json({ ok: true }); };
  try {
    assert.equal(await reportUsageMonth(env, '2026-10'), true);
    assert.equal(report.url, 'https://eu-creations-command-centre.wernich.chatgpt.site/api/ai-usage');
    assert.equal(report.init.headers.Authorization, 'Bearer test-only-report-token');
    assert.equal(JSON.parse(report.init.body).month, '2026-10');
    assert.ok(sqlite.prepare('SELECT last_synced_at FROM ai_reporting').get().last_synced_at);
  } finally { globalThis.fetch = original; }
});

test('reporting routes reject non-admins and cross-origin connection attempts', async () => {
  const routes = new Map(); register({ add(method, path, fn) { routes.set(method + path, fn); } });
  const denied = await routes.get('GET/maintenance/ai-reporting')({ data: { admin: false } });
  assert.equal(denied.status, 403);
  const crossOrigin = await routes.get('POST/maintenance/ai-reporting/connect')({ data: { admin: true }, request: new Request('https://pretty.example/api/maintenance/ai-reporting/connect', { method: 'POST', headers: { origin: 'https://other.example' } }) });
  assert.equal(crossOrigin.status, 403);
});
