// Inventory (materials) and Finished products share the same logic.
import { json } from '../db.js';
import { uid, body, clean } from '../util.js';
import { movement, UNITS } from '../stock.js';

const CFG = {
  materials: { type: 'material', fields: ['name', 'sku', 'category_id', 'unit', 'reorder_level', 'notes'] },
  products: { type: 'product', fields: ['name', 'sku', 'category_id', 'size', 'size_unit', 'unit_cost', 'selling_price', 'reorder_level', 'description'] }
};
const NUM = ['reorder_level', 'size', 'unit_cost', 'selling_price'];

function pick(b, fields) {
  const o = {};
  for (const f of fields) if (b[f] !== undefined) o[f] = NUM.includes(f) ? (Number(b[f]) || 0) : clean(b[f], f === 'notes' || f === 'description' ? 2000 : 120);
  if (o.unit !== undefined && !UNITS.includes(o.unit)) o.unit = 'g';
  if (o.category_id === '') o.category_id = null;
  return o;
}

export function register(r) {
  for (const [table, cfg] of Object.entries(CFG)) {
    const T = cfg.type;
    const listSql = `SELECT x.*, c.name AS category,
        COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='${T}' AND item_id=x.id),0) AS stock,
        (SELECT SUM(qty*unit_cost)/NULLIF(SUM(qty),0) FROM stock_movements WHERE item_type='${T}' AND item_id=x.id AND reason IN ('opening','purchase','batch_output') AND qty>0) AS avg_cost
      FROM ${table} x LEFT JOIN categories c ON c.id=x.category_id`;

    r.add('GET', `/${table}`, async ({ env, request }) => {
      const all = new URL(request.url).searchParams.get('all');
      const rows = (await env.DB.prepare(listSql + (all ? '' : ' WHERE x.active=1') + ' ORDER BY x.name COLLATE NOCASE').all()).results;
      return json(rows);
    });

    r.add('GET', `/${table}/:id`, async ({ env }, p) => {
      const item = await env.DB.prepare(listSql + ' WHERE x.id=?').bind(p.id).first();
      if (!item) return json({ error: 'Not found' }, 404);
      const moves = (await env.DB.prepare(`SELECT * FROM stock_movements WHERE item_type=? AND item_id=? ORDER BY date DESC, created_at DESC LIMIT 200`).bind(T, p.id).all()).results;
      return json({ item, moves });
    });

    r.add('POST', `/${table}`, async ({ env, request, data }) => {
      const b = await body(request); const o = pick(b, cfg.fields);
      if (!o.name) return json({ error: 'Please enter a name' }, 400);
      const dup = await env.DB.prepare(`SELECT id FROM ${table} WHERE lower(name)=lower(?) AND active=1`).bind(o.name).first();
      if (dup) return json({ error: 'An item with that name already exists' }, 400);
      const id = uid(); const cols = ['id', ...Object.keys(o)];
      const stmts = [env.DB.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(id, ...Object.values(o))];
      const q = Number(b.opening_qty) || 0;
      if (q) stmts.push(movement(env.DB, { item_type: T, item_id: id, qty: q, unit_cost: b.opening_cost ?? o.unit_cost ?? 0, reason: 'opening', date: b.opening_date, note: 'Opening stock', created_by: data.user }));
      await env.DB.batch(stmts);
      return json({ id }, 201);
    });

    r.add('PUT', `/${table}/:id`, async ({ env, request }, p) => {
      const o = pick(await body(request), cfg.fields);
      if (o.name === '') return json({ error: 'Please enter a name' }, 400);
      const keys = Object.keys(o); if (!keys.length) return json({ ok: true });
      await env.DB.prepare(`UPDATE ${table} SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).bind(...Object.values(o), p.id).run();
      return json({ ok: true });
    });

    r.add('POST', `/${table}/:id/adjust`, async ({ env, request, data }, p) => {
      const b = await body(request); const q = Number(b.qty);
      if (!q) return json({ error: 'Enter a quantity (use a minus for stock going out)' }, 400);
      const reason = b.reason === 'opening' ? 'opening' : 'adjustment';
      if (q < 0) {
        const cur = await env.DB.prepare('SELECT COALESCE(SUM(qty),0) AS s FROM stock_movements WHERE item_type=? AND item_id=?').bind(T, p.id).first();
        if (cur.s + q < 0) return json({ error: `You only have ${Math.round(cur.s * 100) / 100} in stock — you can't take out ${Math.abs(q)}.` }, 400);
      }
      await movement(env.DB, { item_type: T, item_id: p.id, qty: q, unit_cost: b.unit_cost || 0, reason, date: b.date, note: clean(b.note, 300) || null, created_by: data.user }).run();
      return json({ ok: true });
    });

    r.add('DELETE', `/${table}/:id`, async ({ env }, p) => {
      const used = await env.DB.prepare(`SELECT COUNT(*) AS n FROM stock_movements WHERE item_type=? AND item_id=? AND reason<>'opening'`).bind(T, p.id).first();
      const inRecipe = T === 'material' ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM recipe_lines WHERE material_id=?').bind(p.id).first()).n : 0;
      if (used.n || inRecipe) {
        await env.DB.prepare(`UPDATE ${table} SET active=0 WHERE id=?`).bind(p.id).run();
        return json({ hidden: true, message: 'This item has history, so it was archived instead of deleted.' });
      }
      await env.DB.batch([env.DB.prepare(`DELETE FROM stock_movements WHERE item_type=? AND item_id=?`).bind(T, p.id), env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(p.id)]);
      return json({ deleted: true });
    });
  }

  r.add('GET', '/dashboard', async ({ env }) => {
    const q = (sql) => env.DB.prepare(sql).first();
    const low = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT m.reorder_level, COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='material' AND item_id=m.id),0) AS s FROM materials m WHERE m.active=1 AND m.reorder_level>0) WHERE s<=reorder_level`).first();
    const value = await q(`SELECT COALESCE(SUM(s*c),0) AS v FROM (SELECT
        COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='material' AND item_id=m.id),0) AS s,
        COALESCE((SELECT SUM(qty*unit_cost)/NULLIF(SUM(qty),0) FROM stock_movements WHERE item_type='material' AND item_id=m.id AND reason IN ('opening','purchase') AND qty>0),0) AS c
      FROM materials m WHERE m.active=1) WHERE s>0`);
    return json({
      materials: (await q('SELECT COUNT(*) AS n FROM materials WHERE active=1')).n,
      products: (await q('SELECT COUNT(*) AS n FROM products WHERE active=1')).n,
      recipes: (await q('SELECT COUNT(*) AS n FROM recipes WHERE active=1')).n,
      lowStock: low.n, stockValue: value.v,
      recent: (await env.DB.prepare(`SELECT sm.date, sm.qty, sm.reason, COALESCE(m.name,p.name) AS name, COALESCE(m.unit,'each') AS unit FROM stock_movements sm LEFT JOIN materials m ON sm.item_type='material' AND m.id=sm.item_id LEFT JOIN products p ON sm.item_type='product' AND p.id=sm.item_id ORDER BY sm.created_at DESC, sm.date DESC LIMIT 8`).all()).results
    });
  });
}
