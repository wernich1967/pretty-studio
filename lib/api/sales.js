import { json } from '../db.js';
import { uid, body, clean } from '../util.js';
import { movement } from '../stock.js';

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const PSTOCK = `COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='product' AND item_id=p.id),0)`;

export function register(r) {
  // A sale = one or more rows sharing a sale_no
  r.add('GET', '/sales', async ({ env }) => {
    const rows = (await env.DB.prepare(`SELECT s.*, p.name AS product FROM sales s LEFT JOIN products p ON p.id=s.product_id ORDER BY s.date DESC, s.created_at DESC`).all()).results;
    const map = new Map();
    for (const x of rows) {
      const k = x.sale_no || x.id;
      if (!map.has(k)) map.set(k, { sale_no: k, date: x.date, customer: x.customer, channel: x.channel, notes: x.notes, source: x.source, lines: [], total: 0, cost: 0 });
      const s = map.get(k); s.lines.push(x); s.total += x.qty * x.unit_price; s.cost += x.qty * x.unit_cost;
    }
    return json([...map.values()].map(s => ({ ...s, total: r2(s.total), cost: r2(s.cost) })));
  });

  // Body: { date, customer, channel, notes, lines: [{ product_id, qty, unit_price }] }
  r.add('POST', '/sales', async ({ env, request, data }) => {
    const b = await body(request), db = env.DB;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : new Date().toISOString().slice(0, 10);
    const lines = (b.lines || []).filter(l => l.product_id && Number(l.qty) > 0);
    if (!lines.length) return json({ error: 'Add at least one product with a quantity' }, 400);
    const need = {};
    for (const l of lines) need[l.product_id] = (need[l.product_id] || 0) + Number(l.qty);
    const prods = {};
    for (const id of Object.keys(need)) {
      const p = await db.prepare(`SELECT p.id, p.name, p.unit_cost, ${PSTOCK} AS stock FROM products p WHERE p.id=?`).bind(id).first();
      if (!p) return json({ error: 'A product no longer exists' }, 400);
      if (p.stock - need[id] < -0.0001) return json({ error: `Not enough ${p.name} in stock: you have ${r2(p.stock)}, this sale needs ${need[id]}.` }, 400);
      prods[id] = p;
    }
    const ymd = date.replace(/-/g, '').slice(2);
    const n = await db.prepare(`SELECT COUNT(DISTINCT sale_no) AS n FROM sales WHERE sale_no LIKE ?`).bind(`S${ymd}-%`).first();
    const saleNo = `S${ymd}-${String(n.n + 1).padStart(2, '0')}`;
    const stmts = [];
    for (const l of lines) {
      const p = prods[l.product_id], q = Number(l.qty), id = uid();
      stmts.push(db.prepare('INSERT INTO sales (id, sale_no, date, product_id, qty, unit_price, unit_cost, customer, channel, notes) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(id, saleNo, date, p.id, q, r2(l.unit_price), p.unit_cost || 0, clean(b.customer, 120) || null, clean(b.channel, 60) || null, clean(b.notes, 500) || null));
      stmts.push(movement(db, { item_type: 'product', item_id: p.id, qty: -q, unit_cost: p.unit_cost || 0, reason: 'sale', ref_type: 'sale', ref_id: saleNo, date, created_by: data.user }));
    }
    await db.batch(stmts);
    return json({ sale_no: saleNo }, 201);
  });

  r.add('DELETE', '/sales/:no', async ({ env }, p) => {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM stock_movements WHERE ref_type='sale' AND ref_id=?`).bind(p.no),
      env.DB.prepare('DELETE FROM sales WHERE sale_no=? OR id=?').bind(p.no, p.no)
    ]);
    return json({ deleted: true });
  });

  // ---- Expenses (money out that isn't stock) ----
  r.add('GET', '/expenses', async ({ env }) => json((await env.DB.prepare('SELECT * FROM expenses ORDER BY date DESC, created_at DESC').all()).results));
  r.add('POST', '/expenses', async ({ env, request }) => {
    const b = await body(request), amt = r2(b.amount);
    if (!amt) return json({ error: 'Enter an amount' }, 400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : new Date().toISOString().slice(0, 10);
    await env.DB.prepare('INSERT INTO expenses (id, date, category, description, amount) VALUES (?,?,?,?,?)').bind(uid(), date, clean(b.category, 60) || 'Other', clean(b.description, 300) || null, amt).run();
    return json({ ok: true }, 201);
  });
  r.add('DELETE', '/expenses/:id', async ({ env }, p) => { await env.DB.prepare('DELETE FROM expenses WHERE id=?').bind(p.id).run(); return json({ deleted: true }); });

  // ---- Financial summary ----
  r.add('GET', '/financial', async ({ env, request }) => {
    const u = new URL(request.url), from = u.searchParams.get('from') || '0000-01-01', to = u.searchParams.get('to') || '9999-12-31', db = env.DB;
    const one = (sql, ...a) => db.prepare(sql).bind(...a).first();
    const sales = await one(`SELECT COALESCE(SUM(qty*unit_price),0) AS rev, COALESCE(SUM(qty*unit_cost),0) AS cogs, COALESCE(SUM(qty),0) AS units, COUNT(DISTINCT COALESCE(sale_no,id)) AS n FROM sales WHERE date BETWEEN ? AND ?`, from, to);
    const purch = await one(`SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS n FROM purchases WHERE date BETWEEN ? AND ?`, from, to);
    const exp = await one(`SELECT COALESCE(SUM(amount),0) AS t FROM expenses WHERE date BETWEEN ? AND ?`, from, to);
    const months = (await db.prepare(`SELECT m, SUM(rev) AS rev, SUM(cogs) AS cogs, SUM(spend) AS spend FROM (
        SELECT substr(date,1,7) AS m, qty*unit_price AS rev, qty*unit_cost AS cogs, 0 AS spend FROM sales
        UNION ALL SELECT substr(date,1,7), 0, 0, total FROM purchases
        UNION ALL SELECT substr(date,1,7), 0, 0, amount FROM expenses) GROUP BY m ORDER BY m DESC LIMIT 12`).all()).results.reverse();
    const top = (await db.prepare(`SELECT p.name, SUM(s.qty) AS units, SUM(s.qty*s.unit_price) AS rev, SUM(s.qty*(s.unit_price-s.unit_cost)) AS profit FROM sales s LEFT JOIN products p ON p.id=s.product_id WHERE s.date BETWEEN ? AND ? GROUP BY s.product_id ORDER BY profit DESC LIMIT 8`).bind(from, to).all()).results;
    const expCats = (await db.prepare(`SELECT category, SUM(amount) AS t FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY t DESC`).bind(from, to).all()).results;
    return json({ from, to, revenue: r2(sales.rev), cogs: r2(sales.cogs), gross: r2(sales.rev - sales.cogs), units: sales.units, sales: sales.n,
      purchases: r2(purch.t), purchaseCount: purch.n, expenses: r2(exp.t), cash: r2(sales.rev - purch.t - exp.t), profit: r2(sales.rev - sales.cogs - exp.t), months, top, expCats });
  });

  // ---- Curing ----
  r.add('POST', '/batches/:id/ready', async ({ env }, p) => {
    await env.DB.prepare(`UPDATE batches SET status='done', ready_date=date('now') WHERE id=?`).bind(p.id).run();
    return json({ ok: true });
  });
}
