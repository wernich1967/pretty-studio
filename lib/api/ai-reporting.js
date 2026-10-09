import { json } from '../db.js';
import { connectReporting, reportingStatus, syncHistory } from '../ai-reporting.js';
export function register(r) {
  r.add('GET', '/maintenance/ai-reporting', async ({ env, data }) => {
    if (!data.admin) return json({ error: 'Administrator access required.' }, 403);
    return json(await reportingStatus(env));
  });
  r.add('POST', '/maintenance/ai-reporting/connect', async ({ env, request, data }) => {
    if (!data.admin) return json({ error: 'Administrator access required.' }, 403);
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return json({ error: 'Connect from Pretty Studio.' }, 403);
    const raw = await request.text();
    if (raw.length > 200) return json({ error: 'Invalid connection code.' }, 400);
    let b; try { b = JSON.parse(raw); } catch { return json({ error: 'Invalid connection code.' }, 400); }
    try { await connectReporting(env, b.code); return json({ ok: true, ...await reportingStatus(env) }); }
    catch (e) { return json({ error: e.message || 'The connection could not be completed.' }, 502); }
  });
  r.add('POST', '/maintenance/ai-reporting/sync', async ({ env, request, data }) => {
    if (!data.admin) return json({ error: 'Administrator access required.' }, 403);
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Sync from Pretty Studio.' }, 403);
    try { await syncHistory(env); return json({ ok: true, ...await reportingStatus(env) }); }
    catch { return json({ error: 'Usage could not be sent. Please try again shortly.' }, 502); }
  });
}
