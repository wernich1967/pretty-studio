// Getting started (setup wizard): progress + opening-stock import from a spreadsheet.
// Progress lives in settings key 'onboarding' — no schema change needed.
import { json } from '../db.js';
import { uid, body, clean } from '../util.js';
import { movement, UNITS } from '../stock.js';

const KEY = 'onboarding';
const FLAGS = ['welcome', 'business', 'categories', 'stock', 'recipe', 'batch', 'sale'];

async function getState(db) {
  const r = await db.prepare('SELECT value FROM settings WHERE key=?').bind(KEY).first();
  try { return r ? JSON.parse(r.value) : {}; } catch { return {}; }
}
async function putState(db, val) {
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(KEY, JSON.stringify(val)).run();
}

// Spreadsheet values → clean numbers ("R 1 234,50" → 1234.5)
export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/[R\s ]/gi, '');
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.'); else s = s.replace(/,/g, '');
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}
const UNIT_WORDS = {
  g: ['g', 'gr', 'gram', 'grams', 'gm', 'gms'], kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  ml: ['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'], l: ['l', 'lt', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters'],
  each: ['each', 'ea', 'unit', 'units', 'pc', 'pcs', 'piece', 'pieces', 'item', 'items', 'x', 'bottle', 'bottles', 'jar', 'jars'],
  pack: ['pack', 'packs', 'pk', 'pkt', 'packet', 'packets', 'box', 'boxes']
};
export function unitOf(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!s) return null;
  for (const [u, words] of Object.entries(UNIT_WORDS)) if (words.includes(s)) return u;
  return undefined; // given but not understood
}
// "250ml" / "250 ml" → { size: 250, size_unit: 'ml' }
function sizeOf(v) {
  const m = String(v ?? '').trim().match(/^([\d.,]+)\s*([a-zA-Z]*)$/);
  if (!m) return {};
  return { size: num(m[1]), size_unit: unitOf(m[2]) || null };
}

// Works out what an import would do. Used for the preview (dry run) and the real import.
async function plan(db, kind, rows) {
  const table = kind === 'product' ? 'products' : 'materials';
  const cats = (await db.prepare('SELECT id, name FROM categories WHERE kind=?').bind(kind).all()).results;
  const catBy = new Map(cats.map(c => [c.name.toLowerCase(), c.id]));
  const existing = new Set((await db.prepare(`SELECT lower(name) AS n FROM ${table} WHERE active=1`).all()).results.map(r => r.n));
  const seen = new Set(), newCats = new Map(), out = [];
  for (const raw of rows.slice(0, 1000)) {
    const name = clean(raw.name, 120);
    if (!name) continue;
    const r = { name, sku: clean(raw.sku, 120), qty: num(raw.qty), cost: num(raw.cost), price: num(raw.price), reorder: num(raw.reorder), notes: [] };
    const key = name.toLowerCase();
    if (existing.has(key)) { r.status = 'exists'; r.notes.push('Already in the studio — skipped'); out.push(r); continue; }
    if (seen.has(key)) { r.status = 'repeat'; r.notes.push('Appears twice in the sheet — first one used'); out.push(r); continue; }
    seen.add(key); r.status = 'new';
    const cat = clean(raw.category, 60);
    if (cat) {
      r.category = cat;
      if (!catBy.has(cat.toLowerCase())) { r.newCategory = true; newCats.set(cat.toLowerCase(), cat); }
    }
    if (kind === 'material') {
      const u = unitOf(raw.unit);
      r.unit = u || 'each';
      if (u === undefined) r.notes.push(`Unit “${clean(raw.unit, 20)}” not recognised — set to “each”`);
      if (u === null) r.notes.push('No unit — set to “each”');
    } else {
      const s = sizeOf(raw.size);
      if (s.size) { r.size = s.size; r.size_unit = s.size_unit || unitOf(raw.unit) || 'ml'; }
    }
    if (r.qty < 0) { r.notes.push('Negative stock set to 0'); r.qty = 0; }
    out.push(r);
  }
  return { rows: out, newCategories: [...newCats.values()], catBy };
}

export function register(r) {
  r.add('GET', '/onboarding', async ({ env }) => {
    const db = env.DB, st = await getState(db);
    const count = async t => (await db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE source='live'`).first()).n;
    const counts = { materials: await count('materials'), products: await count('products'), recipes: await count('recipes'), batches: await count('batches'), sales: await count('sales') };
    const b = await db.prepare("SELECT value FROM settings WHERE key='business'").first();
    const biz = b ? JSON.parse(b.value) : {};
    const done = {
      welcome: !!st.welcome,
      business: !!(st.business || biz.ownerName),
      categories: !!st.categories,
      stock: counts.materials + counts.products > 0,
      recipe: counts.recipes > 0,
      batch: counts.batches > 0,
      sale: counts.sales > 0
    };
    const n = Object.values(done).filter(Boolean).length;
    return json({ done, counts, doneCount: n, total: FLAGS.length, complete: n === FLAGS.length, hidden: !!st.hidden, started: !!st.welcome || n > 0 });
  });

  // { step: 'welcome'|'business'|'categories', done: true } or { hidden: true/false }
  r.add('PUT', '/onboarding', async ({ env, request }) => {
    const b = await body(request), st = await getState(env.DB);
    if (['welcome', 'business', 'categories'].includes(b.step)) st[b.step] = b.done !== false;
    if (b.hidden !== undefined) st.hidden = !!b.hidden;
    await putState(env.DB, st);
    return json({ ok: true });
  });

  // { kind: 'material'|'product', rows: [{name, category, sku, unit, qty, cost, price, reorder, size}], dry_run, date }
  r.add('POST', '/onboarding/import', async ({ env, request, data }) => {
    const b = await body(request), db = env.DB;
    const kind = b.kind === 'product' ? 'product' : 'material';
    if (!Array.isArray(b.rows) || !b.rows.length) return json({ error: 'No rows to import' }, 400);
    const p = await plan(db, kind, b.rows);
    const summary = { new: p.rows.filter(x => x.status === 'new').length, skipped: p.rows.filter(x => x.status !== 'new').length, newCategories: p.newCategories };
    if (b.dry_run) return json({ ...summary, rows: p.rows });
    if (!summary.new) return json({ error: 'Nothing new to import — every item is already in the studio.' }, 400);

    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : new Date().toISOString().slice(0, 10);
    const stmts = [];
    const max = await db.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM categories WHERE kind=?').bind(kind).first();
    let sort = max.m;
    for (const name of p.newCategories) {
      const id = uid(); p.catBy.set(name.toLowerCase(), id);
      stmts.push(db.prepare('INSERT INTO categories (id, kind, name, sort, active) VALUES (?,?,?,?,1)').bind(id, kind, name, ++sort));
    }
    for (const x of p.rows.filter(x => x.status === 'new')) {
      const id = uid(), cat = x.category ? p.catBy.get(x.category.toLowerCase()) : null;
      if (kind === 'material') {
        stmts.push(db.prepare('INSERT INTO materials (id, name, sku, category_id, unit, reorder_level) VALUES (?,?,?,?,?,?)').bind(id, x.name, x.sku || null, cat, UNITS.includes(x.unit) ? x.unit : 'each', x.reorder));
      } else {
        stmts.push(db.prepare('INSERT INTO products (id, name, sku, category_id, size, size_unit, unit_cost, selling_price, reorder_level) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(id, x.name, x.sku || null, cat, x.size || null, x.size_unit || null, x.cost, x.price, x.reorder));
      }
      if (x.qty) stmts.push(movement(db, { item_type: kind, item_id: id, qty: x.qty, unit_cost: x.cost, reason: 'opening', date, note: 'Opening stock (spreadsheet import)', created_by: data.user }));
    }
    // One batch = all-or-nothing; very large sheets go in chunks of 400 statements.
    for (let i = 0; i < stmts.length; i += 400) await db.batch(stmts.slice(i, i + 400));
    return json({ imported: summary.new, skipped: summary.skipped, newCategories: p.newCategories });
  });
}
