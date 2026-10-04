import { json } from '../db.js';
import { uid, body, clean } from '../util.js';

export function ytId(url) {
  const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(url || ''); return m ? m[1] : null;
}
export function register(r) {
  r.add('GET', '/videos', async ({ env }) => json((await env.DB.prepare('SELECT * FROM videos ORDER BY created_at DESC').all()).results.map(v => ({ ...v, yt: ytId(v.url) }))));
  r.add('POST', '/videos', async ({ env, request }) => {
    const b = await body(request), url = clean(b.url, 500);
    if (!/^https?:\/\//i.test(url)) return json({ error: 'Paste a full link starting with https://' }, 400);
    const id = uid();
    await env.DB.prepare('INSERT INTO videos (id, url, title, category) VALUES (?,?,?,?)').bind(id, url, clean(b.title, 200) || null, clean(b.category, 60) || null).run();
    return json({ id }, 201);
  });
  r.add('PUT', '/videos/:id', async ({ env, request }, p) => {
    const b = await body(request);
    await env.DB.prepare('UPDATE videos SET title=?, category=? WHERE id=?').bind(clean(b.title, 200) || null, clean(b.category, 60) || null, p.id).run();
    return json({ ok: true });
  });
  r.add('DELETE', '/videos/:id', async ({ env }, p) => { await env.DB.prepare('DELETE FROM videos WHERE id=?').bind(p.id).run(); return json({ deleted: true }); });
}
