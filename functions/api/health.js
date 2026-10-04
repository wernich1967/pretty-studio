import { ensureSchema, json } from '../../lib/db.js';
import { APP_VERSION, APP_DATE } from '../../lib/version.js';

export async function onRequestGet({ env, request }) {
  const out = { app: 'Pretty Studio', version: APP_VERSION, date: APP_DATE, database: 'not connected', files: 'not connected' };
  if (env.DB) {
    try {
      await ensureSchema(env.DB);
      const v = await env.DB.prepare('SELECT MAX(version) AS v FROM schema_migrations').first();
      const t = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf%' AND name NOT LIKE 'sqlite%'").first();
      out.database = 'ok'; out.schemaVersion = v.v; out.tables = t.n;
    } catch (e) { out.database = 'error: ' + e.message; }
  }
  if (env.FILES) {
    try { await env.FILES.list({ limit: 1 }); out.files = 'ok'; } catch (e) { out.files = 'error: ' + e.message; }
  }
  out.user = request.headers.get('cf-access-authenticated-user-email') || 'not signed in (login not set up yet)';
  return json(out);
}
