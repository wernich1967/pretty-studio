import { json } from '../db.js';
import { uid, body, clean } from '../util.js';
import { movement } from '../stock.js';

const TABLES = ['suppliers', 'materials', 'products', 'purchases', 'purchase_lines', 'recipes', 'recipe_lines', 'batches', 'sales', 'stock_movements', 'files', 'videos'];

// EU Serenity category -> Pretty material category
function matCategory(cat, name) {
  const n = (name || '').toLowerCase();
  if (cat === 'Packaging') return 'mc-packaging';
  if (['Mould', 'Tool', 'Equipment'].includes(cat)) return 'mc-equipment';
  if (cat === 'Other supply') return 'mc-other';
  if (/fragrance|essential oil|tea tree/.test(n)) return 'mc-fragrance';
  if (/\boil\b|butter/.test(n)) return 'mc-oil';
  return 'mc-ingredient';
}
const UNIT = u => (['g', 'kg', 'ml', 'l', 'each', 'pack'].includes(u) ? u : 'each');

function dataUrlToBytes(d) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(d || ''); if (!m) return null;
  const bin = atob(m[2]); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes: out };
}
async function saveFile(env, key, dataUrl, kind, name, source) {
  const f = dataUrlToBytes(dataUrl); if (!f || !env.FILES) return null;
  await env.FILES.put(key, f.bytes, { httpMetadata: { contentType: f.mime } });
  await env.DB.prepare('INSERT OR REPLACE INTO files (key, kind, name, mime, size, source) VALUES (?,?,?,?,?,?)').bind(key, kind, name, f.mime, f.bytes.length, source).run();
  return key;
}

export function register(r) {
  r.add('GET', '/maintenance/stats', async ({ env }) => {
    const out = {};
    for (const t of TABLES) out[t] = await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(source='test') AS test FROM ${t}`).first();
    const v = await env.DB.prepare('SELECT MAX(version) AS v FROM schema_migrations').first();
    return json({ tables: out, schemaVersion: v.v });
  });

  // Step 1 of the EU Serenity test import: purchases -> suppliers, materials, purchases, lines, stock
  r.add('POST', '/maintenance/import/serenity-purchases', async ({ env, request, data }) => {
    const already = await env.DB.prepare(`SELECT COUNT(*) AS n FROM materials WHERE source='test'`).first();
    if (already.n) return json({ error: 'Test data is already loaded. Remove it first if you want to load it again.' }, 400);
    const { purchases = [] } = await body(request);
    const db = env.DB, S = 'test', stmts = [];
    const suppliers = {}, materials = {}, invoices = {};
    for (const p of purchases) {
      const vName = clean(p.vendor, 120) || 'Unknown supplier';
      if (!suppliers[vName]) { suppliers[vName] = uid(); stmts.push(db.prepare('INSERT INTO suppliers (id, name, source) VALUES (?,?,?)').bind(suppliers[vName], vName, S)); }
      const mName = clean(p.name, 120); const mk = mName.toLowerCase();
      if (!materials[mk]) {
        materials[mk] = uid();
        stmts.push(db.prepare('INSERT INTO materials (id, name, category_id, unit, reorder_level, notes, source) VALUES (?,?,?,?,?,?,?)')
          .bind(materials[mk], mName, matCategory(p.category, mName), UNIT(p.unit), Number(p.reorder) || 0, clean(p.notes, 500) || null, S));
      }
      const ik = vName + '|' + (p.invoiceNo || p.id);
      if (!invoices[ik]) { invoices[ik] = { id: uid(), supplier: suppliers[vName], no: clean(p.invoiceNo, 60), date: p.date || '2026-07-01', total: 0 }; }
      invoices[ik].total += Number(p.price) || 0;
      const qty = Number(p.quantity) || 0, lineTotal = Number(p.price) || 0;
      stmts.push(db.prepare('INSERT INTO purchase_lines (id, purchase_id, material_id, description, qty, unit, line_total, source) VALUES (?,?,?,?,?,?,?,?)')
        .bind(uid(), invoices[ik].id, materials[mk], mName, qty, UNIT(p.unit), lineTotal, S));
      stmts.push(movement(db, { item_type: 'material', item_id: materials[mk], qty, unit_cost: qty ? lineTotal / qty : 0, reason: 'purchase', ref_type: 'purchase', ref_id: invoices[ik].id, date: p.date, created_by: data.user, source: S }));
      const used = p.stockQty == null ? 0 : qty - Number(p.stockQty);
      if (used > 0) stmts.push(movement(db, { item_type: 'material', item_id: materials[mk], qty: -used, reason: 'adjustment', date: p.date, note: 'Used before import', created_by: data.user, source: S }));
    }
    for (const inv of Object.values(invoices))
      stmts.push(db.prepare('INSERT INTO purchases (id, supplier_id, invoice_no, date, total, source) VALUES (?,?,?,?,?,?)').bind(inv.id, inv.supplier, inv.no, inv.date, Math.round(inv.total * 100) / 100, S));
    await db.batch(stmts);
    // one invoice photo, if any
    for (const p of purchases) if (p.image) {
      const inv = invoices[(clean(p.vendor, 120) || 'Unknown supplier') + '|' + (p.invoiceNo || p.id)];
      const key = await saveFile(env, `invoice-${inv.id}`, p.image, 'invoice', p.name, S);
      if (key) await db.prepare('UPDATE purchases SET file_key=? WHERE id=?').bind(key, inv.id).run();
    }
    return json({ suppliers: Object.keys(suppliers).length, materials: Object.keys(materials).length, purchases: Object.keys(invoices).length });
  });

  // Step 2: one recipe per request (keeps each request small)
  r.add('POST', '/maintenance/import/serenity-recipe', async ({ env, request }) => {
    const { recipe: x } = await body(request); if (!x || !x.name) return json({ error: 'No recipe' }, 400);
    const db = env.DB, S = 'test', id = uid();
    const cat = await db.prepare(`SELECT id FROM categories WHERE kind='product' AND lower(name)=lower(?)`).bind(x.category || '').first();
    const stmts = [db.prepare('INSERT INTO recipes (id, name, category_id, yield_qty, yield_unit, notes, source) VALUES (?,?,?,?,?,?,?)')
      .bind(id, clean(x.name, 120), cat ? cat.id : null, Number(x.totalWeight) || null, 'g', clean(x.notes, 3000) || null, S)];
    let i = 0;
    for (const ing of x.ingredients || []) {
      const m = await db.prepare(`SELECT id FROM materials WHERE lower(name)=lower(?) AND active=1`).bind(ing.name || '').first();
      stmts.push(db.prepare('INSERT INTO recipe_lines (id, recipe_id, material_id, description, qty, unit, sort, source) VALUES (?,?,?,?,?,?,?,?)')
        .bind(uid(), id, m ? m.id : null, clean(ing.name, 200), Number(ing.grams) || 0, 'g', i++, S));
    }
    await db.batch(stmts);
    if (x.image) { const key = await saveFile(env, `recipe-${id}`, x.image, 'recipe', x.name, S); if (key) await db.prepare('UPDATE recipes SET image_key=? WHERE id=?').bind(key, id).run(); }
    return json({ id });
  });

  r.add('POST', '/maintenance/import/serenity-videos', async ({ env, request }) => {
    const { videos = [] } = await body(request);
    const stmts = videos.filter(v => v.url).map(v => env.DB.prepare('INSERT INTO videos (id, url, title, category, source) VALUES (?,?,?,?,?)').bind(uid(), clean(v.url, 500), clean(v.title, 200), clean(v.category, 60), 'test'));
    if (stmts.length) await env.DB.batch(stmts);
    return json({ videos: stmts.length });
  });

  r.add('POST', '/maintenance/remove-test-data', async ({ env, request }) => {
    const b = await body(request);
    if (b.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm' }, 400);
    const files = (await env.DB.prepare(`SELECT key FROM files WHERE source='test'`).all()).results;
    for (const f of files) { try { await env.FILES.delete(f.key); } catch { } }
    const db = env.DB;
    await db.batch([
      // anything done to test items goes with them (e.g. a manual adjustment on a test ingredient)
      db.prepare(`DELETE FROM stock_movements WHERE (item_type='material' AND item_id IN (SELECT id FROM materials WHERE source='test')) OR (item_type='product' AND item_id IN (SELECT id FROM products WHERE source='test'))`),
      db.prepare(`DELETE FROM recipe_lines WHERE recipe_id IN (SELECT id FROM recipes WHERE source='test')`),
      db.prepare(`DELETE FROM purchase_lines WHERE purchase_id IN (SELECT id FROM purchases WHERE source='test')`),
      ...TABLES.map(t => db.prepare(`DELETE FROM ${t} WHERE source='test'`)),
      // tidy any history left pointing at items that no longer exist
      db.prepare(`DELETE FROM stock_movements WHERE (item_type='material' AND item_id NOT IN (SELECT id FROM materials)) OR (item_type='product' AND item_id NOT IN (SELECT id FROM products))`)
    ]);
    return json({ ok: true, filesRemoved: files.length });
  });

  r.add('GET', '/maintenance/export', async ({ env }) => {
    const out = { app: 'Pretty Studio', exported: new Date().toISOString(), tables: {} };
    for (const t of ['settings', 'categories', ...TABLES]) out.tables[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
    return new Response(JSON.stringify(out, null, 1), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="Pretty-backup-${out.exported.slice(0, 10)}.json"` } });
  });

  r.add('GET', '/files/:key', async ({ env }, p) => {
    const obj = env.FILES && await env.FILES.get(p.key);
    if (!obj) return json({ error: 'File not found' }, 404);
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'private, max-age=86400' } });
  });

  r.add('GET', '/recipes', async ({ env }) => {
    const rows = (await env.DB.prepare(`SELECT r.*, c.name AS category, (SELECT COUNT(*) FROM recipe_lines WHERE recipe_id=r.id) AS lines FROM recipes r LEFT JOIN categories c ON c.id=r.category_id WHERE r.active=1 ORDER BY r.name`).all()).results;
    return json(rows);
  });
}
