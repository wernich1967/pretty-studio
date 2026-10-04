import { json } from '../db.js';
import { uid, body, clean } from '../util.js';
import { movement, UNITS } from '../stock.js';
import { saveFile, deleteFile } from '../files.js';

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const STOCK = t => `COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='${t}' AND item_id=x.id),0)`;
const AVG = `(SELECT SUM(qty*unit_cost)/NULLIF(SUM(qty),0) FROM stock_movements WHERE item_type='material' AND item_id=m.id AND reason IN ('opening','purchase') AND qty>0)`;

const normName = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|a|an|recipe)\b/g, ' ').replace(/\s+/g, ' ').trim();
export async function similarRecipes(db, name, exceptId) {
  const n = normName(name); if (!n) return [];
  const rows = (await db.prepare('SELECT id, name FROM recipes WHERE active=1').all()).results;
  const words = new Set(n.split(' ').filter(w => w.length > 2));
  return rows.filter(r => r.id !== exceptId).map(r => {
    const m = normName(r.name); if (m === n) return { ...r, reason: 'same name' };
    const w2 = m.split(' ').filter(w => w.length > 2), common = w2.filter(w => words.has(w)).length;
    if (words.size && w2.length && common / Math.max(words.size, w2.length) >= 0.75) return { ...r, reason: 'very similar name' };
    return null;
  }).filter(Boolean).slice(0, 5);
}

export function register(r) {
  r.add('POST', '/recipes/check', async ({ env, request }) => { const b = await body(request); return json({ duplicates: await similarRecipes(env.DB, b.name, b.id) }); });

  // ---- Recipes ----
  r.add('GET', '/recipes', async ({ env }) => json((await env.DB.prepare(`SELECT r.*, c.name AS category, p.name AS product,
      (SELECT COUNT(*) FROM recipe_lines WHERE recipe_id=r.id) AS lines, (SELECT COUNT(*) FROM batches WHERE recipe_id=r.id) AS batches
      FROM recipes r LEFT JOIN categories c ON c.id=r.category_id LEFT JOIN products p ON p.id=r.product_id WHERE r.active=1 ORDER BY r.name COLLATE NOCASE`).all()).results));

  r.add('GET', '/recipes/:id', async ({ env }, p) => {
    const rec = await env.DB.prepare('SELECT r.*, c.name AS category, p.name AS product FROM recipes r LEFT JOIN categories c ON c.id=r.category_id LEFT JOIN products p ON p.id=r.product_id WHERE r.id=?').bind(p.id).first();
    if (!rec) return json({ error: 'Not found' }, 404);
    const lines = (await env.DB.prepare(`SELECT l.*, m.name AS material, m.unit AS material_unit, ${AVG} AS avg_cost,
        COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='material' AND item_id=m.id),0) AS stock
      FROM recipe_lines l LEFT JOIN materials m ON m.id=l.material_id WHERE l.recipe_id=? ORDER BY l.sort`).bind(p.id).all()).results;
    return json({ recipe: rec, lines });
  });

  const saveRecipe = async (env, id, b, isNew) => {
    const db = env.DB, name = clean(b.name, 120);
    if (!name) return json({ error: 'Please enter a recipe name' }, 400);
    if (!b.allow_duplicate) { const d = await similarRecipes(db, name, isNew ? null : id); if (d.length) return json({ error: `A recipe called “${d[0].name}” already exists.`, duplicates: d }, 409); }
    const lines = (b.lines || []).filter(l => (l.material_id || clean(l.description, 200)) && Number(l.qty) > 0);
    const vals = [name, b.category_id || null, b.product_id || null, Number(b.yield_qty) || null, UNITS.includes(b.yield_unit) ? b.yield_unit : 'g', clean(b.method, 5000) || null, clean(b.notes, 3000) || null];
    const stmts = [isNew
      ? db.prepare('INSERT INTO recipes (name, category_id, product_id, yield_qty, yield_unit, method, notes, id) VALUES (?,?,?,?,?,?,?,?)').bind(...vals, id)
      : db.prepare('UPDATE recipes SET name=?, category_id=?, product_id=?, yield_qty=?, yield_unit=?, method=?, notes=? WHERE id=?').bind(...vals, id),
    db.prepare('DELETE FROM recipe_lines WHERE recipe_id=?').bind(id)];
    lines.forEach((l, i) => stmts.push(db.prepare('INSERT INTO recipe_lines (id, recipe_id, material_id, description, qty, unit, sort) VALUES (?,?,?,?,?,?,?)')
      .bind(uid(), id, l.material_id || null, clean(l.description, 200) || null, Number(l.qty), UNITS.includes(l.unit) ? l.unit : 'g', i)));
    await db.batch(stmts);
    if (b.image) { const key = await saveFile(env, `recipe-${id}-${Date.now()}`, b.image, 'recipe', name); const old = await db.prepare('SELECT image_key FROM recipes WHERE id=?').bind(id).first(); await db.prepare('UPDATE recipes SET image_key=? WHERE id=?').bind(key, id).run(); if (old?.image_key) await deleteFile(env, old.image_key); }
    return json({ id }, isNew ? 201 : 200);
  };
  r.add('POST', '/recipes', async ({ env, request }) => saveRecipe(env, uid(), await body(request), true));
  r.add('PUT', '/recipes/:id', async ({ env, request }, p) => saveRecipe(env, p.id, await body(request), false));
  r.add('DELETE', '/recipes/:id', async ({ env }, p) => {
    const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM batches WHERE recipe_id=?').bind(p.id).first();
    if (used.n) { await env.DB.prepare('UPDATE recipes SET active=0 WHERE id=?').bind(p.id).run(); return json({ hidden: true, message: 'This recipe has batches, so it was archived instead of deleted.' }); }
    const rec = await env.DB.prepare('SELECT image_key FROM recipes WHERE id=?').bind(p.id).first();
    await env.DB.batch([env.DB.prepare('DELETE FROM recipe_lines WHERE recipe_id=?').bind(p.id), env.DB.prepare('DELETE FROM recipes WHERE id=?').bind(p.id)]);
    await deleteFile(env, rec?.image_key);
    return json({ deleted: true });
  });

  // ---- Batches ----
  r.add('GET', '/batches', async ({ env }) => json((await env.DB.prepare(`SELECT b.*, r.name AS recipe, p.name AS product FROM batches b LEFT JOIN recipes r ON r.id=b.recipe_id LEFT JOIN products p ON p.id=b.product_id ORDER BY b.date DESC, b.created_at DESC`).all()).results));

  r.add('GET', '/batches/:id', async ({ env }, p) => {
    const b = await env.DB.prepare('SELECT b.*, r.name AS recipe, p.name AS product FROM batches b LEFT JOIN recipes r ON r.id=b.recipe_id LEFT JOIN products p ON p.id=b.product_id WHERE b.id=?').bind(p.id).first();
    if (!b) return json({ error: 'Not found' }, 404);
    const used = (await env.DB.prepare(`SELECT sm.*, m.name, m.unit FROM stock_movements sm LEFT JOIN materials m ON m.id=sm.item_id WHERE sm.ref_type='batch' AND sm.ref_id=? AND sm.reason='batch_use'`).bind(p.id).all()).results;
    return json({ batch: b, used });
  });

  // Body: { recipe_id, product_id, qty_made, date, best_before, ready_date, notes, update_cost, lines: [{ material_id, qty }] } — qty in the material's own unit
  r.add('POST', '/batches', async ({ env, request, data }) => {
    const b = await body(request), db = env.DB;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : new Date().toISOString().slice(0, 10);
    const lines = (b.lines || []).filter(l => l.material_id && Number(l.qty) > 0);
    const made = Number(b.qty_made) || 0;
    if (!lines.length && !made) return json({ error: 'Nothing to record — add ingredients or the quantity made' }, 400);
    if (made && !b.product_id) return json({ error: 'Choose which finished product this batch makes' }, 400);
    // check stock & cost
    let cost = 0; const stmts = [], id = uid();
    const ymd = date.replace(/-/g, '').slice(2);
    const n = await db.prepare(`SELECT COUNT(*) AS n FROM batches WHERE batch_no LIKE ?`).bind(`B${ymd}-%`).first();
    const batchNo = `B${ymd}-${String(n.n + 1).padStart(2, '0')}`;
    for (const l of lines) {
      const m = await db.prepare(`SELECT m.name, m.unit, COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='material' AND item_id=m.id),0) AS stock, ${AVG} AS avg FROM materials m WHERE m.id=?`).bind(l.material_id).first();
      if (!m) return json({ error: 'An ingredient no longer exists' }, 400);
      const q = Number(l.qty);
      if (m.stock - q < -0.0001) return json({ error: `Not enough ${m.name}: you have ${r2(m.stock)} ${m.unit}, the batch needs ${r2(q)} ${m.unit}.` }, 400);
      cost += q * (m.avg || 0);
      stmts.push(movement(db, { item_type: 'material', item_id: l.material_id, qty: -q, unit_cost: m.avg || 0, reason: 'batch_use', ref_type: 'batch', ref_id: id, batch_no: batchNo, date, created_by: data.user }));
    }
    const unitCost = made ? cost / made : 0;
    if (made) stmts.push(movement(db, { item_type: 'product', item_id: b.product_id, qty: made, unit_cost: unitCost, reason: 'batch_output', ref_type: 'batch', ref_id: id, batch_no: batchNo, date, created_by: data.user }));
    stmts.push(db.prepare('INSERT INTO batches (id, batch_no, recipe_id, product_id, date, qty_made, cost_total, ready_date, best_before, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, batchNo, b.recipe_id || null, b.product_id || null, date, made, r2(cost), b.ready_date || null, b.best_before || null, b.ready_date && b.ready_date > date ? 'curing' : 'done', clean(b.notes, 1000) || null));
    if (made && b.update_cost && unitCost > 0) stmts.push(db.prepare('UPDATE products SET unit_cost=? WHERE id=?').bind(r2(unitCost), b.product_id));
    await db.batch(stmts);
    return json({ id, batch_no: batchNo, cost: r2(cost), unit_cost: r2(unitCost) }, 201);
  });

  // Undo a batch: puts ingredients back, removes the products it made (refused if they've been sold).
  r.add('DELETE', '/batches/:id', async ({ env }, p) => {
    const db = env.DB;
    const b = await db.prepare('SELECT * FROM batches WHERE id=?').bind(p.id).first();
    if (!b) return json({ error: 'Not found' }, 404);
    if (b.product_id && b.qty_made) {
      const s = await db.prepare(`SELECT COALESCE(SUM(qty),0) AS s FROM stock_movements WHERE item_type='product' AND item_id=?`).bind(b.product_id).first();
      if (s.s - b.qty_made < -0.0001) return json({ error: "Can't undo — some of the products from this batch have already been sold." }, 400);
    }
    await db.batch([db.prepare(`DELETE FROM stock_movements WHERE ref_type='batch' AND ref_id=?`).bind(p.id), db.prepare('DELETE FROM batches WHERE id=?').bind(p.id)]);
    return json({ deleted: true });
  });
}
