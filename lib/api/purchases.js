import { json } from '../db.js';
import { uid, body, clean } from '../util.js';
import { movement, UNITS } from '../stock.js';
import { saveFile, deleteFile } from '../files.js';

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

// ---- Duplicate detection ----
const normInv = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, '');
const normSup = s => String(s || '').toLowerCase().replace(/\b(pty|ltd|cc|inc)\b/g, '').replace(/[^a-z0-9]/g, '');
export async function findDuplicates(db, { supplier_id, supplier_name, invoice_no, date, total }) {
  let supName = supplier_name;
  if (supplier_id && !supName) { const s = await db.prepare('SELECT name FROM suppliers WHERE id=?').bind(supplier_id).first(); supName = s?.name; }
  const ns = normSup(supName), ni = normInv(invoice_no), t = Number(total) || 0;
  if (!ns && !ni) return [];
  const rows = (await db.prepare(`SELECT p.id, p.invoice_no, p.date, p.total, s.name AS supplier FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.date DESC LIMIT 2000`).all()).results;
  const out = [];
  for (const r of rows) {
    const sameSup = ns && normSup(r.supplier) === ns;
    if (ni && normInv(r.invoice_no) === ni && (sameSup || !ns || !r.supplier)) out.push({ ...r, reason: 'same invoice number' });
    else if (sameSup && date && r.date === date && t && Math.abs(r.total - t) < 1) out.push({ ...r, reason: 'same supplier, date and total' });
  }
  return out.slice(0, 5);
}

export function register(r) {
  // ---- Suppliers ----
  r.add('GET', '/suppliers', async ({ env }) => json((await env.DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM purchases WHERE supplier_id=s.id) AS purchases, (SELECT MAX(date) FROM purchases WHERE supplier_id=s.id) AS last FROM suppliers s WHERE s.active=1 ORDER BY s.name COLLATE NOCASE`).all()).results));
  r.add('POST', '/suppliers', async ({ env, request }) => {
    const b = await body(request); const name = clean(b.name, 120);
    if (!name) return json({ error: 'Please enter a supplier name' }, 400);
    const id = uid();
    await env.DB.prepare('INSERT INTO suppliers (id, name, contact, phone, email, notes) VALUES (?,?,?,?,?,?)').bind(id, name, clean(b.contact, 120) || null, clean(b.phone, 40) || null, clean(b.email, 120) || null, clean(b.notes, 1000) || null).run();
    return json({ id, name }, 201);
  });
  r.add('PUT', '/suppliers/:id', async ({ env, request }, p) => {
    const b = await body(request); const name = clean(b.name, 120);
    if (!name) return json({ error: 'Please enter a supplier name' }, 400);
    await env.DB.prepare('UPDATE suppliers SET name=?, contact=?, phone=?, email=?, notes=? WHERE id=?').bind(name, clean(b.contact, 120) || null, clean(b.phone, 40) || null, clean(b.email, 120) || null, clean(b.notes, 1000) || null, p.id).run();
    return json({ ok: true });
  });

  // ---- Purchases ----
  r.add('POST', '/purchases/check', async ({ env, request }) => json({ duplicates: await findDuplicates(env.DB, await body(request)) }));

  r.add('GET', '/purchases', async ({ env }) => json((await env.DB.prepare(`SELECT p.*, s.name AS supplier, (SELECT COUNT(*) FROM purchase_lines WHERE purchase_id=p.id) AS lines
      FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.date DESC, p.created_at DESC`).all()).results));

  r.add('GET', '/purchases/:id', async ({ env }, p) => {
    const pur = await env.DB.prepare('SELECT p.*, s.name AS supplier FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?').bind(p.id).first();
    if (!pur) return json({ error: 'Not found' }, 404);
    const lines = (await env.DB.prepare('SELECT l.*, m.name AS material, m.unit AS material_unit FROM purchase_lines l LEFT JOIN materials m ON m.id=l.material_id WHERE l.purchase_id=?').bind(p.id).all()).results;
    return json({ purchase: pur, lines });
  });

  // Body: { supplier_id | supplier_name, invoice_no, date, notes, file (data URL), lines: [{ material_id | new_material:{name,unit,category_id}, qty, line_total }] }
  r.add('POST', '/purchases', async ({ env, request, data }) => {
    const b = await body(request), db = env.DB;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : new Date().toISOString().slice(0, 10);
    const lines = (b.lines || []).filter(l => (l.material_id || l.new_material?.name) && Number(l.qty) > 0);
    if (!lines.length) return json({ error: 'Add at least one line with an item and a quantity' }, 400);
    if (!b.allow_duplicate) {
      const lt = lines.reduce((a, l) => a + (Number(l.line_total) || 0), 0);
      const dups = await findDuplicates(db, { supplier_id: b.supplier_id, supplier_name: b.supplier_name, invoice_no: b.invoice_no, date, total: lt });
      if (dups.length) return json({ error: `This looks like a duplicate of a purchase already recorded (${dups[0].supplier || 'no supplier'}, ${dups[0].date}, ${dups[0].invoice_no || 'no invoice no.'}).`, duplicates: dups }, 409);
    }
    const stmts = [];
    let supplierId = b.supplier_id || null;
    if (!supplierId && clean(b.supplier_name, 120)) {
      const ex = await db.prepare('SELECT id FROM suppliers WHERE lower(name)=lower(?) AND active=1').bind(clean(b.supplier_name, 120)).first();
      supplierId = ex ? ex.id : uid();
      if (!ex) stmts.push(db.prepare('INSERT INTO suppliers (id, name) VALUES (?,?)').bind(supplierId, clean(b.supplier_name, 120)));
    }
    const pid = uid(); let total = 0;
    for (const l of lines) {
      let mid = l.material_id, unit;
      if (!mid) {
        const nm = clean(l.new_material.name, 120);
        const ex = await db.prepare('SELECT id, unit FROM materials WHERE lower(name)=lower(?) AND active=1').bind(nm).first();
        if (ex) { mid = ex.id; unit = ex.unit; }
        else {
          mid = uid(); unit = UNITS.includes(l.new_material.unit) ? l.new_material.unit : 'each';
          stmts.push(db.prepare('INSERT INTO materials (id, name, category_id, unit) VALUES (?,?,?,?)').bind(mid, nm, l.new_material.category_id || null, unit));
        }
      } else {
        const m = await db.prepare('SELECT unit FROM materials WHERE id=?').bind(mid).first();
        if (!m) return json({ error: 'One of the items no longer exists' }, 400);
        unit = m.unit;
      }
      const qty = Number(l.qty), lt = r2(l.line_total); total += lt;
      stmts.push(db.prepare('INSERT INTO purchase_lines (id, purchase_id, material_id, description, qty, unit, line_total) VALUES (?,?,?,?,?,?,?)').bind(uid(), pid, mid, clean(l.description || l.new_material?.name, 200) || null, qty, unit, lt));
      stmts.push(movement(db, { item_type: 'material', item_id: mid, qty, unit_cost: qty ? lt / qty : 0, reason: 'purchase', ref_type: 'purchase', ref_id: pid, date, created_by: data.user }));
    }
    stmts.push(db.prepare('INSERT INTO purchases (id, supplier_id, invoice_no, date, total, notes) VALUES (?,?,?,?,?,?)').bind(pid, supplierId, clean(b.invoice_no, 60) || null, date, r2(total), clean(b.notes, 1000) || null));
    await db.batch(stmts);
    if (b.file) {
      try { const key = await saveFile(env, `invoice-${pid}`, b.file, 'invoice', b.invoice_no); if (key) await db.prepare('UPDATE purchases SET file_key=? WHERE id=?').bind(key, pid).run(); }
      catch (e) { return json({ id: pid, warning: 'Purchase saved, but the attachment was not: ' + e.message }, 201); }
    }
    return json({ id: pid, total: r2(total) }, 201);
  });

  r.add('POST', '/purchases/:id/file', async ({ env, request }, p) => {
    const b = await body(request);
    const key = await saveFile(env, `invoice-${p.id}`, b.file, 'invoice', b.name);
    await env.DB.prepare('UPDATE purchases SET file_key=? WHERE id=?').bind(key, p.id).run();
    return json({ key });
  });

  // Undo a purchase: removes its stock. Refused if that stock has already been used.
  r.add('DELETE', '/purchases/:id', async ({ env }, p) => {
    const db = env.DB;
    const pur = await db.prepare('SELECT * FROM purchases WHERE id=?').bind(p.id).first();
    if (!pur) return json({ error: 'Not found' }, 404);
    const lines = (await db.prepare('SELECT l.material_id, SUM(l.qty) AS q, m.name FROM purchase_lines l LEFT JOIN materials m ON m.id=l.material_id WHERE purchase_id=? GROUP BY l.material_id').bind(p.id).all()).results;
    for (const l of lines) {
      const s = await db.prepare(`SELECT COALESCE(SUM(qty),0) AS s FROM stock_movements WHERE item_type='material' AND item_id=?`).bind(l.material_id).first();
      if (s.s - l.q < -0.0001) return json({ error: `Can't delete — some of the ${l.name} from this purchase has already been used.` }, 400);
    }
    await db.batch([
      db.prepare(`DELETE FROM stock_movements WHERE ref_type='purchase' AND ref_id=?`).bind(p.id),
      db.prepare('DELETE FROM purchase_lines WHERE purchase_id=?').bind(p.id),
      db.prepare('DELETE FROM purchases WHERE id=?').bind(p.id)
    ]);
    await deleteFile(env, pur.file_key);
    return json({ deleted: true });
  });
}
