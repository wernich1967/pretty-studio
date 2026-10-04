import { json } from '../db.js';
import { uid, body, clean } from '../util.js';

export function register(r) {
  r.add('GET', '/me', async ({ env, data }) => {
    const b = await env.DB.prepare("SELECT value FROM settings WHERE key='business'").first();
    return json({ email: data.user, strictLogin: data.strict, business: b ? JSON.parse(b.value) : {} });
  });

  r.add('PUT', '/settings/business', async ({ env, request }) => {
    const b = await body(request);
    const cur = await env.DB.prepare("SELECT value FROM settings WHERE key='business'").first();
    const val = Object.assign(cur ? JSON.parse(cur.value) : {}, {
      name: clean(b.name, 80) || 'Pretty', ownerName: clean(b.ownerName, 60),
      phone: clean(b.phone, 40), email: clean(b.email, 120), address: clean(b.address, 300)
    });
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('business', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(JSON.stringify(val)).run();
    return json(val);
  });

  r.add('GET', '/categories', async ({ env, request }) => {
    const kind = new URL(request.url).searchParams.get('kind');
    const q = kind ? env.DB.prepare('SELECT * FROM categories WHERE kind=? ORDER BY sort, name').bind(kind) : env.DB.prepare('SELECT * FROM categories ORDER BY kind, sort, name');
    return json((await q.all()).results);
  });

  r.add('POST', '/categories', async ({ env, request }) => {
    const b = await body(request);
    const kind = b.kind === 'material' ? 'material' : 'product';
    const name = clean(b.name, 60);
    if (!name) return json({ error: 'Please enter a name' }, 400);
    const dup = await env.DB.prepare('SELECT id FROM categories WHERE kind=? AND lower(name)=lower(?)').bind(kind, name).first();
    if (dup) return json({ error: 'That category already exists' }, 400);
    const max = await env.DB.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM categories WHERE kind=?').bind(kind).first();
    const row = { id: uid(), kind, name, sort: max.m + 1, active: 1 };
    await env.DB.prepare('INSERT INTO categories (id, kind, name, sort, active) VALUES (?,?,?,?,1)').bind(row.id, kind, name, row.sort).run();
    return json(row, 201);
  });

  r.add('PUT', '/categories/:id', async ({ env, request }, p) => {
    const b = await body(request);
    const cur = await env.DB.prepare('SELECT * FROM categories WHERE id=?').bind(p.id).first();
    if (!cur) return json({ error: 'Not found' }, 404);
    const name = b.name !== undefined ? clean(b.name, 60) : cur.name;
    if (!name) return json({ error: 'Please enter a name' }, 400);
    const active = b.active !== undefined ? (b.active ? 1 : 0) : cur.active;
    const sort = b.sort !== undefined ? Number(b.sort) || 0 : cur.sort;
    await env.DB.prepare('UPDATE categories SET name=?, active=?, sort=? WHERE id=?').bind(name, active, sort, p.id).run();
    return json({ ...cur, name, active, sort });
  });

  r.add('DELETE', '/categories/:id', async ({ env }, p) => {
    const used = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM products WHERE category_id=?1) + (SELECT COUNT(*) FROM materials WHERE category_id=?1) + (SELECT COUNT(*) FROM recipes WHERE category_id=?1) AS n').bind(p.id).first();
    if (used.n > 0) {
      await env.DB.prepare('UPDATE categories SET active=0 WHERE id=?').bind(p.id).run();
      return json({ hidden: true, message: 'This category is in use, so it was hidden instead of deleted.' });
    }
    await env.DB.prepare('DELETE FROM categories WHERE id=?').bind(p.id).run();
    return json({ deleted: true });
  });
}
