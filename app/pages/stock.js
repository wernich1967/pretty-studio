// Inventory (materials) and Finished products pages
import { api, toast, modal, closeModal, esc, money, qty, today, UNITS, REASONS, options, categories, $ } from '../core.js';

const CFG = {
  inventory: { table: 'materials', kind: 'material', title: 'Ingredients & supplies', sub: 'Ingredients, packaging and supplies — stock updates from purchases, batches and adjustments.', noun: 'item' },
  products: { table: 'products', kind: 'product', title: 'Finished products', sub: 'What you sell — stock on hand, cost and selling price.', noun: 'product' }
};
const view = { q: '', cat: '' };

export function render(page) {
  const c = CFG[page];
  return `<div class="head"><div><h1>${c.title}</h1><div class="sub">${c.sub}</div></div>
    <button class="btn" id="addItem">+ Add ${c.noun}</button></div>
    <div class="tiles" id="tiles"></div>
    <div class="card">
      <div class="row" style="margin-bottom:14px;flex-wrap:wrap"><input id="q" placeholder="Search by name or code…" style="flex:2;min-width:180px" value="${esc(view.q)}"><select id="catF" style="flex:1;min-width:150px"></select></div>
      <div id="table"><div class="empty">Loading…</div></div>
    </div>`;
}

export async function after(page) {
  const c = CFG[page];
  const cats = (await categories(c.kind)).filter(x => x.active);
  $('#catF').innerHTML = options(cats.map(x => ({ value: x.id, label: x.name })), view.cat, 'All categories');
  const rows = await api('/' + c.table);
  const draw = () => {
    const q = view.q.toLowerCase();
    const list = rows.filter(r => (!view.cat || r.category_id === view.cat) && (!q || (r.name + ' ' + (r.sku || '')).toLowerCase().includes(q)));
    const low = r => r.reorder_level > 0 && r.stock <= r.reorder_level;
    const value = rows.reduce((a, r) => a + Math.max(r.stock, 0) * (page === 'products' ? r.unit_cost : (r.avg_cost || 0)), 0);
    $('#tiles').innerHTML = `<div class="tile"><div class="k">${page === 'products' ? 'Products' : 'Items'}</div><div class="v">${rows.length}</div></div>
      <div class="tile"><div class="k">Low stock</div><div class="v" style="color:${rows.some(low) ? 'var(--rose)' : 'inherit'}">${rows.filter(low).length}</div></div>
      <div class="tile"><div class="k">Stock value (cost)</div><div class="v">${money(value)}</div></div>
      ${page === 'products' ? `<div class="tile"><div class="k">Retail value</div><div class="v">${money(rows.reduce((a, r) => a + Math.max(r.stock, 0) * r.selling_price, 0))}</div></div>` : ''}`;
    $('#table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Name</th><th>Category</th><th class="r">In stock</th>
      ${page === 'products' ? '<th class="r">Cost</th><th class="r">Price</th>' : '<th class="r">Avg cost</th><th class="r">Reorder at</th>'}</tr></thead><tbody>
      ${list.map(r => `<tr data-id="${r.id}" class="${low(r) ? 'low' : ''}"><td><b>${esc(r.name)}</b>${r.sku ? `<div class="note">${esc(r.sku)}</div>` : ''}${r.source === 'test' ? ' <span class="pill">test</span>' : ''}</td>
        <td>${esc(r.category || '—')}</td><td class="r">${qty(r.stock, page === 'products' ? (r.size_unit ? '' : 'units') : r.unit)}${low(r) ? ' <span class="pill red">low</span>' : ''}</td>
        ${page === 'products' ? `<td class="r">${money(r.unit_cost)}</td><td class="r">${money(r.selling_price)}</td>` : `<td class="r">${r.avg_cost ? money(r.avg_cost) + '<span class="note">/' + esc(r.unit) + '</span>' : '—'}</td><td class="r">${r.reorder_level ? qty(r.reorder_level, r.unit) : '—'}</td>`}</tr>`).join('')}
      </tbody></table>` : `<div class="empty">${rows.length ? 'Nothing matches your search.' : `No ${c.noun}s yet — click “Add ${c.noun}” to start, or load test data under Maintenance.`}</div>`;
    $('#table').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => detail(page, tr.dataset.id));
  };
  $('#q').oninput = e => { view.q = e.target.value; draw(); };
  $('#catF').onchange = e => { view.cat = e.target.value; draw(); };
  $('#addItem').onclick = () => form(page, null, cats);
  draw();
}

function form(page, item, cats) {
  const c = CFG[page], p = page === 'products', it = item || {};
  const card = modal(`<h2>${item ? 'Edit' : 'Add'} ${c.noun}</h2>
    <div class="field"><label>Name</label><input id="f_name" value="${esc(it.name)}"></div>
    <div class="grid2">
      <div class="field"><label>Category</label><select id="f_category_id">${options(cats.map(x => ({ value: x.id, label: x.name })), it.category_id, '— choose —')}</select></div>
      <div class="field"><label>Product code (SKU)</label><input id="f_sku" value="${esc(it.sku)}" placeholder="optional"></div>
      ${p ? `<div class="field"><label>Size</label><div class="row"><input id="f_size" type="number" step="any" value="${it.size ?? ''}" placeholder="e.g. 250"><select id="f_size_unit" style="width:90px">${options(UNITS.map(u => ({ value: u, label: u })), it.size_unit || 'ml')}</select></div></div>
        <div class="field"><label>Reorder when stock reaches</label><input id="f_reorder_level" type="number" step="any" value="${it.reorder_level ?? ''}"></div>
        <div class="field"><label>Cost to make, per item (R)</label><input id="f_unit_cost" type="number" step="any" value="${it.unit_cost ?? ''}"></div>
        <div class="field"><label>Selling price (R)</label><input id="f_selling_price" type="number" step="any" value="${it.selling_price ?? ''}"></div>`
      : `<div class="field"><label>Unit you count it in</label><select id="f_unit">${options(UNITS.map(u => ({ value: u, label: u })), it.unit || 'g')}</select></div>
        <div class="field"><label>Reorder when stock reaches</label><input id="f_reorder_level" type="number" step="any" value="${it.reorder_level ?? ''}"></div>`}
    </div>
    ${item ? '' : `<div class="box"><b>Opening stock</b> <span class="note">— what you have on the shelf today</span>
      <div class="grid2" style="margin-top:8px"><div class="field"><label>Quantity</label><input id="o_qty" type="number" step="any"></div>
      ${p ? '' : '<div class="field"><label>Cost per unit (R)</label><input id="o_cost" type="number" step="any" placeholder="e.g. 0.38 per g"></div>'}</div></div>`}
    <div class="field"><label>${p ? 'Description (for your website)' : 'Notes'}</label><textarea id="f_${p ? 'description' : 'notes'}" rows="2">${esc(p ? it.description : it.notes)}</textarea></div>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="save">${item ? 'Save changes' : 'Add ' + c.noun}</button></div>`);
  card.querySelector('#cancel').onclick = closeModal;
  card.querySelector('#save').onclick = async () => {
    const b = {}; card.querySelectorAll('[id^=f_]').forEach(el => b[el.id.slice(2)] = el.value);
    if (!item) { b.opening_qty = card.querySelector('#o_qty').value; if (!p) b.opening_cost = card.querySelector('#o_cost').value; }
    if (item) await api(`/${c.table}/${item.id}`, { method: 'PUT', body: b }); else await api('/' + c.table, { method: 'POST', body: b });
    closeModal(); toast(item ? 'Saved' : `${c.noun[0].toUpperCase() + c.noun.slice(1)} added`); after(page);
  };
  card.querySelector('#f_name').focus();
}

async function detail(page, id) {
  const c = CFG[page], { item, moves } = await api(`/${c.table}/${id}`), u = page === 'products' ? '' : item.unit;
  const card = modal(`<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>${esc(item.name)}</h2><div class="note">${esc(item.category || 'No category')}${item.sku ? ' · ' + esc(item.sku) : ''}</div></div>
      <div style="text-align:right"><div class="note">In stock</div><div style="font:500 28px 'Cormorant Garamond',serif">${qty(item.stock, u)}</div></div></div>
    <div class="box" style="margin-top:14px"><b>Adjust stock</b> <span class="note">— counted, spilled, given away… use a minus for stock going out</span>
      <div class="row" style="margin-top:8px;flex-wrap:wrap"><input id="a_qty" type="number" step="any" placeholder="e.g. -50 or 200" style="flex:1;min-width:120px"><input id="a_note" placeholder="Reason (optional)" style="flex:2;min-width:160px"><button class="btn small" id="a_save">Save</button></div></div>
    <h3 style="margin:16px 0 6px">History</h3>
    <div class="hist">${moves.length ? moves.map(m => `<div class="li"><span class="note" style="width:84px">${esc(m.date)}</span><span class="name">${REASONS[m.reason] || m.reason}${m.note ? ' <span class="note">· ' + esc(m.note) + '</span>' : ''}</span><b style="color:${m.qty < 0 ? 'var(--rose)' : 'var(--ok)'}">${m.qty > 0 ? '+' : ''}${qty(m.qty, u)}</b></div>`).join('') : '<div class="empty">No stock movements yet.</div>'}</div>
    <div class="row" style="justify-content:space-between;margin-top:18px"><button class="btn danger small" id="del">Delete</button><div class="row"><button class="btn ghost" id="close">Close</button><button class="btn" id="edit">Edit details</button></div></div>`);
  card.querySelector('#close').onclick = closeModal;
  card.querySelector('#a_save').onclick = async () => { await api(`/${c.table}/${id}/adjust`, { method: 'POST', body: { qty: card.querySelector('#a_qty').value, note: card.querySelector('#a_note').value } }); toast('Stock updated'); detail(page, id); after(page); };
  card.querySelector('#edit').onclick = async () => form(page, item, (await categories(c.kind)).filter(x => x.active || x.id === item.category_id));
  card.querySelector('#del').onclick = () => {
    const b = card.querySelector('#del'); if (b.dataset.sure) return;
    b.dataset.sure = 1; b.textContent = 'Click again to confirm';
    b.onclick = async () => { const r = await api(`/${c.table}/${id}`, { method: 'DELETE' }); closeModal(); toast(r.hidden ? r.message : 'Deleted'); after(page); };
  };
}
