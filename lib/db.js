import { MIGRATIONS } from './migrations.js';

let checked = false; // per isolate: skip the check after the first success

export async function ensureSchema(db) {
  if (checked) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT DEFAULT (datetime('now')))`).run();
  const row = await db.prepare('SELECT MAX(version) AS v FROM schema_migrations').first();
  const current = (row && row.v) || 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const stmts = m.sql.map(s => db.prepare(s));
    stmts.push(db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').bind(m.version, m.name));
    await db.batch(stmts); // all-or-nothing
  }
  checked = true;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
