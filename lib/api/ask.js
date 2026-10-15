// "Ask a question": the AI answers from the studio's own records using READ-ONLY look-ups.
// Nothing here writes to the database — the AI can look, never change.
import { json } from '../db.js';
import { body, clean } from '../util.js';
import { chat } from '../ai.js';

const saToday = () => new Date(Date.now() + 7200000).toISOString().slice(0, 10); // South African date (UTC+2)
const monthStart = () => saToday().slice(0, 8) + '01';
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const words = q => String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1).slice(0, 6);

// Same unit rules as the app (g ≈ ml for oils and liquids).
const BASE = { g: ['m', 1], kg: ['m', 1000], ml: ['v', 1], l: ['v', 1000], each: ['c', 1], pack: ['p', 1] };
function convert(q, from, to) {
  const a = BASE[from], b = BASE[to]; if (!a || !b) return null;
  if (a[0] === b[0] || (a[0] !== 'c' && a[0] !== 'p' && b[0] !== 'c' && b[0] !== 'p')) return q * a[1] / b[1];
  return null;
}
// name LIKE every word (falls back to any word when nothing matches)
function nameFilter(col, q) {
  const w = words(q); if (!w.length) return [['1=1', []], null];
  return [[w.map(() => `lower(${col}) LIKE ?`).join(' AND '), w.map(x => `%${x}%`)], [w.map(() => `lower(${col}) LIKE ?`).join(' OR '), w.map(x => `%${x}%`)]];
}
async function all(db, sql, args = []) { return (await db.prepare(sql).bind(...args).all()).results; }
async function withFallback(db, build, q) {
  const [strict, loose] = nameFilter(build.col[0], q);
  let rows = await all(db, build.sql(strict[0]), [...build.pre, ...strict[1], ...build.post]);
  if (!rows.length && loose) rows = await all(db, build.sql(loose[0]), [...build.pre, ...loose[1], ...build.post]);
  return rows;
}
const ITEM_SQL = {
  material: w => `SELECT x.id, x.name, 'ingredient/supply' AS kind, c.name AS category, x.unit, x.reorder_level, x.active, x.source,
      COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='material' AND item_id=x.id),0) AS stock,
      (SELECT SUM(qty*unit_cost)/NULLIF(SUM(qty),0) FROM stock_movements WHERE item_type='material' AND item_id=x.id AND reason IN ('opening','purchase') AND qty>0) AS avg_cost
    FROM materials x LEFT JOIN categories c ON c.id=x.category_id WHERE ${w} ORDER BY x.name COLLATE NOCASE LIMIT 60`,
  product: w => `SELECT x.id, x.name, 'finished product' AS kind, c.name AS category, 'each' AS unit, x.size, x.size_unit, x.reorder_level, x.active, x.source,
      x.unit_cost, x.selling_price, COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='product' AND item_id=x.id),0) AS stock
    FROM products x LEFT JOIN categories c ON c.id=x.category_id WHERE ${w} ORDER BY x.name COLLATE NOCASE LIMIT 60`
};
const tidy = r => { const o = { ...r }; delete o.id; o.stock = r2(o.stock); if (o.avg_cost != null) o.avg_cost_per_unit = r2(o.avg_cost); delete o.avg_cost; o.active = !!o.active; if (o.source === 'test') o.test_data = true; delete o.source;
  o.out_of_stock = o.stock <= 0; o.low = o.out_of_stock || (o.reorder_level > 0 && o.stock <= o.reorder_level); return o; };

const TOOLS = [
  { name: 'find_items', description: 'Look up ingredients & supplies and/or finished products with current stock on hand, unit, reorder level, average cost (ingredients) or cost/selling price (products). Use for "do I have…", "how much…", "what is running low", stock value.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Part of the item name, e.g. "coconut". Leave empty for all items.' }, kind: { type: 'string', enum: ['ingredient', 'product', 'any'] }, low_only: { type: 'boolean', description: 'Only items that are out of stock or at/below their reorder level' } } } },
  { name: 'item_history', description: 'Recent stock movements of one item (purchases, batches, sales, adjustments) and, for ingredients, the last purchases with supplier and price.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'recipes', description: 'Recipes with their ingredient lines, how much of each is in stock, how many batches could be made from current stock, and the estimated batch cost.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Part of the recipe name; empty for all' } } } },
  { name: 'sales_summary', description: 'Sales between two dates: revenue, cost of goods, profit, units and number of sales, optionally grouped.',
    input_schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD, default first day of this month' }, to: { type: 'string', description: 'YYYY-MM-DD, default today' }, group_by: { type: 'string', enum: ['none', 'product', 'month', 'channel'] } } } },
  { name: 'purchases', description: 'Purchases (supplier invoices) between dates, optionally for one supplier or item, newest first, with their lines.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, supplier: { type: 'string' }, item: { type: 'string' } } } },
  { name: 'batches', description: 'Batches made: batch number, product, date, quantity, cost, curing ready date and best-before date.',
    input_schema: { type: 'object', properties: { curing_only: { type: 'boolean' }, from: { type: 'string' }, to: { type: 'string' }, product: { type: 'string' } } } },
  { name: 'expenses', description: 'Non-stock expenses (courier, market fees, printing…) between dates, totalled by category.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } } },
  { name: 'suppliers', description: 'Suppliers with contact details, number of purchases and total spent.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } } } }
];

function range(i) { return [isDate(i.from) ? i.from : monthStart(), isDate(i.to) ? i.to : saToday()]; }

async function runTool(db, name, i) {
  if (name === 'find_items') {
    const kinds = i.kind === 'ingredient' ? ['material'] : i.kind === 'product' ? ['product'] : ['material', 'product'];
    let out = [];
    for (const k of kinds) out.push(...await withFallback(db, { col: ['x.name', i.query], sql: w => ITEM_SQL[k](`(${w})`), pre: [], post: [] }, i.query));
    out = out.map(tidy).filter(r => r.active || i.query);
    if (i.low_only) out = out.filter(r => r.low);
    const value = out.reduce((a, r) => a + r.stock * (r.avg_cost_per_unit ?? r.unit_cost ?? 0), 0);
    return { count: out.length, items: out.slice(0, 40), stock_value_of_these: r2(value) };
  }
  if (name === 'item_history') {
    let item = null, type = null;
    for (const k of ['material', 'product']) {
      const rows = (await withFallback(db, { col: ['x.name', i.name], sql: w => ITEM_SQL[k](`(${w})`), pre: [], post: [] }, i.name));
      if (rows.length) { item = rows[0]; type = k; break; }
    }
    if (!item) return { found: false };
    const moves = await all(db, `SELECT date, qty, reason, batch_no, note FROM stock_movements WHERE item_type=? AND item_id=? ORDER BY date DESC, created_at DESC LIMIT 25`, [type, item.id]);
    const buys = type === 'material' ? await all(db, `SELECT p.date, s.name AS supplier, p.invoice_no, l.qty, l.unit, l.line_total FROM purchase_lines l JOIN purchases p ON p.id=l.purchase_id LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE l.material_id=? ORDER BY p.date DESC LIMIT 10`, [item.id]) : [];
    return { item: tidy(item), recent_movements: moves.map(m => ({ ...m, qty: r2(m.qty) })), recent_purchases: buys };
  }
  if (name === 'recipes') {
    const recs = await withFallback(db, { col: ['r.name', i.query], sql: w => `SELECT r.id, r.name, r.yield_qty, r.yield_unit, c.name AS category, p.name AS product FROM recipes r LEFT JOIN categories c ON c.id=r.category_id LEFT JOIN products p ON p.id=r.product_id WHERE r.active=1 AND (${w}) ORDER BY r.name LIMIT 10`, pre: [], post: [] }, i.query);
    const out = [];
    for (const r of recs) {
      const lines = await all(db, `SELECT l.description, l.qty, l.unit, m.name AS material, m.unit AS stock_unit,
          COALESCE((SELECT SUM(qty) FROM stock_movements WHERE item_type='material' AND item_id=m.id),0) AS stock,
          (SELECT SUM(qty*unit_cost)/NULLIF(SUM(qty),0) FROM stock_movements WHERE item_type='material' AND item_id=m.id AND reason IN ('opening','purchase') AND qty>0) AS avg_cost
        FROM recipe_lines l LEFT JOIN materials m ON m.id=l.material_id WHERE l.recipe_id=? ORDER BY l.sort`, [r.id]);
      let batches = Infinity, cost = 0, costKnown = true;
      const ls = lines.map(l => {
        const need = l.material ? convert(l.qty, l.unit, l.stock_unit) : null;
        if (need > 0) { batches = Math.min(batches, Math.floor(l.stock / need)); if (l.avg_cost != null) cost += need * l.avg_cost; else costKnown = false; } else costKnown = false;
        return { ingredient: l.material || l.description, amount: `${r2(l.qty)} ${l.unit || ''}`.trim(), in_stock: l.material ? `${r2(l.stock)} ${l.stock_unit}` : 'not linked to stock', enough_for_one_batch: need > 0 ? l.stock >= need : null };
      });
      out.push({ name: r.name, product: r.product, category: r.category, makes: r.yield_qty ? `${r.yield_qty} ${r.yield_unit || ''}`.trim() : null, lines: ls,
        batches_possible_from_stock: Number.isFinite(batches) ? batches : null, estimated_batch_cost: r2(cost), cost_is_partial: !costKnown });
    }
    return { count: out.length, recipes: out };
  }
  if (name === 'sales_summary') {
    const [from, to] = range(i), g = { product: 'p.name', month: "substr(s.date,1,7)", channel: "COALESCE(s.channel,'(not set)')" }[i.group_by];
    const rows = await all(db, `SELECT ${g ? g + ' AS grp,' : ''} SUM(s.qty) AS units, SUM(s.qty*s.unit_price) AS revenue, SUM(s.qty*s.unit_cost) AS cost, COUNT(DISTINCT COALESCE(s.sale_no,s.id)) AS sales
      FROM sales s LEFT JOIN products p ON p.id=s.product_id WHERE s.date BETWEEN ? AND ? ${g ? 'GROUP BY grp ORDER BY revenue DESC LIMIT 40' : ''}`, [from, to]);
    return { from, to, rows: rows.map(r => ({ ...(g ? { [i.group_by]: r.grp } : {}), units: r2(r.units), revenue: r2(r.revenue), cost_of_goods: r2(r.cost), profit: r2(r.revenue - r.cost), number_of_sales: r.sales })) };
  }
  if (name === 'purchases') {
    const [from, to] = isDate(i.from) || isDate(i.to) ? range(i) : ['0000-01-01', saToday()];
    const args = [from, to]; let w = '';
    if (i.supplier) { w += ' AND lower(s.name) LIKE ?'; args.push(`%${String(i.supplier).toLowerCase()}%`); }
    if (i.item) { w += ' AND p.id IN (SELECT l.purchase_id FROM purchase_lines l LEFT JOIN materials m ON m.id=l.material_id WHERE lower(COALESCE(m.name,l.description)) LIKE ?)'; args.push(`%${String(i.item).toLowerCase()}%`); }
    const ps = await all(db, `SELECT p.id, p.date, p.invoice_no, p.total, s.name AS supplier FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.date BETWEEN ? AND ? ${w} ORDER BY p.date DESC LIMIT 20`, args);
    for (const p of ps) { p.lines = await all(db, `SELECT COALESCE(m.name,l.description) AS item, l.qty, l.unit, l.line_total FROM purchase_lines l LEFT JOIN materials m ON m.id=l.material_id WHERE l.purchase_id=?`, [p.id]); delete p.id; }
    return { from, to, count: ps.length, total_spent: r2(ps.reduce((a, p) => a + (p.total || 0), 0)), purchases: ps };
  }
  if (name === 'batches') {
    const args = []; let w = '1=1';
    if (i.curing_only) { w += " AND b.status='curing' AND b.ready_date>?"; args.push(saToday()); }
    if (isDate(i.from)) { w += ' AND b.date>=?'; args.push(i.from); }
    if (isDate(i.to)) { w += ' AND b.date<=?'; args.push(i.to); }
    if (i.product) { w += ' AND lower(COALESCE(p.name,r.name)) LIKE ?'; args.push(`%${String(i.product).toLowerCase()}%`); }
    const rows = await all(db, `SELECT b.batch_no, b.date, COALESCE(p.name,r.name) AS product, b.qty_made, b.cost_total, b.ready_date, b.best_before, b.status FROM batches b LEFT JOIN products p ON p.id=b.product_id LEFT JOIN recipes r ON r.id=b.recipe_id WHERE ${w} ORDER BY b.date DESC LIMIT 30`, args);
    return { today: saToday(), count: rows.length, batches: rows };
  }
  if (name === 'expenses') {
    const [from, to] = range(i);
    const rows = await all(db, `SELECT COALESCE(category,'Other') AS category, SUM(amount) AS total, COUNT(*) AS n FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC`, [from, to]);
    return { from, to, total: r2(rows.reduce((a, r) => a + r.total, 0)), by_category: rows.map(r => ({ ...r, total: r2(r.total) })) };
  }
  if (name === 'suppliers') {
    const rows = await withFallback(db, { col: ['s.name', i.query], sql: w => `SELECT s.name, s.contact, s.phone, s.email, (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id=s.id) AS purchases, (SELECT COALESCE(SUM(total),0) FROM purchases p WHERE p.supplier_id=s.id) AS spent, (SELECT MAX(date) FROM purchases p WHERE p.supplier_id=s.id) AS last_purchase FROM suppliers s WHERE s.active=1 AND (${w}) ORDER BY spent DESC LIMIT 30`, pre: [], post: [] }, i.query);
    return { count: rows.length, suppliers: rows.map(r => ({ ...r, spent: r2(r.spent) })) };
  }
  throw new Error('Unknown look-up: ' + name);
}

export function register(r) {
  // Body: { question, history: [{ role: 'user'|'assistant', text }] } — history is the last few turns of this conversation.
  r.add('POST', '/ai/ask', async ({ env, request, data }) => {
    const b = await body(request), question = clean(b.question, 600);
    if (!question || question.length < 3) return json({ error: 'Type a question first' }, 400);
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-6)
      .filter(h => (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim())
      .map(h => ({ role: h.role, content: clean(h.text, 2000) }));
    while (hist.length && hist[0].role !== 'user') hist.shift();
    const biz = await env.DB.prepare("SELECT value FROM settings WHERE key='business'").first();
    const name = (biz && JSON.parse(biz.value).name) || 'Pretty';
    const system = `You are the assistant inside ${name} Studio, the stock, recipe, batch and sales app of a small South African hair & body products maker.
Today is ${saToday()} (South Africa). Money is in rand, written like R1 234,50. The business is not VAT-registered.
Answer questions ONLY from the owner's records, using the look-up tools. Never guess or invent numbers, items or dates; if the records don't show it, say so plainly. If a name isn't found, mention the closest names you did find.
You can only look — you cannot record, change or delete anything. If asked to, say which page of the app does it (e.g. Purchases, Batches, Sales, Ingredients & supplies, Finished products, Recipes, Financial).
Keep answers short and friendly in plain English: lead with the direct answer, then the key figures. Use a short list only when it helps. Items marked test_data are practice records — mention that if relevant.`;
    try {
      const out = await chat(env, { feature: 'ask', user: data.user, system, tools: TOOLS, messages: [...hist, { role: 'user', content: question }], runTool: (n, i) => runTool(env.DB, n, i) });
      return json({ answer: out.text || 'Sorry, I could not find an answer to that.', used: out.used, cost_usd: out.cost });
    } catch (e) { return json({ error: e.message }, 502); }
  });
}
