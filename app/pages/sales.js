import { api, toast, modal, closeModal, esc, money, qty, today, $ } from '../core.js';

export function render() {
  return `<div class="head"><div><h1>Sales</h1><div class="sub">Record what you sell — finished stock goes down and profit is worked out for you.</div></div><button class="btn" id="addS">+ Record a sale</button></div>
    <div class="tiles" id="tiles"></div>
    <div class="card"><div class="row" style="margin-bottom:14px"><input id="q" placeholder="Search customer, product, sale number…"></div><div id="table"><div class="empty">Loading…</div></div></div>`;
}
export async function after() {
  const rows = await api('/sales'), m = today().slice(0, 7), mon = rows.filter(s => s.date.startsWith(m));
  const sum = (l, k) => l.reduce((a, s) => a + s[k], 0);
  $('#tiles').innerHTML = `<div class="tile"><div class="k">Sales this month</div><div class="v">${money(sum(mon, 'total'))}</div></div>
    <div class="tile"><div class="k">Profit this month</div><div class="v">${money(sum(mon, 'total') - sum(mon, 'cost'))}</div></div>
    <div class="tile"><div class="k">All-time sales</div><div class="v">${money(sum(rows, 'total'))}</div></div>`;
  const draw = q => {
    q = (q || '').toLowerCase();
    const list = rows.filter(s => !q || `${s.sale_no} ${s.customer} ${s.channel} ${s.lines.map(l => l.product).join(' ')}`.toLowerCase().includes(q));
    $('#table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Sale</th><th>Products</th><th class="r">Total</th><th class="r">Profit</th></tr></thead><tbody>
      ${list.map(s => `<tr data-no="${esc(s.sale_no)}"><td>${esc(s.date)}</td><td><b>${esc(s.sale_no)}</b><div class="note">${esc([s.customer, s.channel].filter(Boolean).join(' · '))}</div></td>
        <td>${s.lines.map(l => `${l.qty} × ${esc(l.product || '?')}`).join('<br>')}</td><td class="r">${money(s.total)}</td><td class="r">${money(s.total - s.cost)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${rows.length ? 'Nothing matches.' : 'No sales yet — click “Record a sale”.'}</div>`;
    $('#table').querySelectorAll('tr[data-no]').forEach(tr => tr.onclick = () => detail(rows.find(s => s.sale_no === tr.dataset.no)));
  };
  $('#q').oninput = e => draw(e.target.value);
  $('#addS').onclick = form;
  draw();
}

async function form() {
  const prods = (await api('/products')).filter(p => p.stock > 0);
  if (!prods.length) return modal(`<h2>Record a sale</h2><p>There are no finished products in stock yet. Add opening stock under <b>Finished products</b>, or make a batch first.</p><div style="text-align:right"><button class="btn" data-close>OK</button></div>`);
  const card = modal(`<h2>Record a sale</h2>
    <div class="grid2"><div class="field"><label>Date</label><input id="date" type="date" value="${today()}"></div>
      <div class="field"><label>Customer <span class="note" style="text-transform:none;letter-spacing:0">(optional)</span></label><input id="cust"></div>
      <div class="field"><label>Sold via</label><input id="chan" list="chans" placeholder="e.g. Market, Instagram, Website"><datalist id="chans"><option>Market</option><option>Instagram</option><option>Facebook</option><option>Website</option><option>Word of mouth</option><option>Shop</option></datalist></div>
      <div class="field"><label>Notes</label><input id="notes"></div></div>
    <label>Products sold</label><div id="lines"></div><button class="btn ghost small" id="addL" style="margin:6px 0 14px">+ Add product</button>
    <div class="row" style="justify-content:space-between"><b id="tot">Total: R 0.00</b><div class="row"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="save">Save sale</button></div></div>`);
  card.classList.add('wide');
  const add = () => {
    const d = document.createElement('div'); d.className = 'pline';
    d.innerHTML = `<select class="mat"><option value="">— choose product —</option>${prods.map(p => `<option value="${p.id}">${esc(p.name)} (${qty(p.stock)} in stock)</option>`).join('')}</select>
      <input class="q" type="number" step="any" placeholder="Qty" value="1"><input class="t" type="number" step="any" placeholder="Price each R"><button class="icon-btn rm">✕</button>`;
    d.querySelector('.mat').onchange = e => { const p = prods.find(x => x.id === e.target.value); if (p) d.querySelector('.t').value = p.selling_price || ''; total(); };
    d.querySelectorAll('input').forEach(i => i.oninput = total);
    d.querySelector('.rm').onclick = () => { d.remove(); total(); };
    $('#lines').appendChild(d);
  };
  const total = () => card.querySelector('#tot').textContent = 'Total: ' + money([...card.querySelectorAll('.pline')].reduce((a, d) => a + (Number(d.querySelector('.q').value) || 0) * (Number(d.querySelector('.t').value) || 0), 0));
  add(); card.querySelector('#addL').onclick = add; card.querySelector('#cancel').onclick = closeModal;
  card.querySelector('#save').onclick = async e => {
    e.target.disabled = true;
    try {
      const r = await api('/sales', { method: 'POST', body: { date: $('#date').value, customer: $('#cust').value, channel: $('#chan').value, notes: $('#notes').value,
        lines: [...card.querySelectorAll('.pline')].map(d => ({ product_id: d.querySelector('.mat').value, qty: d.querySelector('.q').value, unit_price: d.querySelector('.t').value })) } });
      closeModal(); toast(`Sale ${r.sale_no} saved`); after();
    } catch { e.target.disabled = false; }
  };
}

function detail(s) {
  const card = modal(`<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>Sale ${esc(s.sale_no)}</h2><div class="note">${esc(s.date)}${s.customer ? ' · ' + esc(s.customer) : ''}${s.channel ? ' · ' + esc(s.channel) : ''}</div></div><div style="font:500 26px 'Cormorant Garamond',serif">${money(s.total)}</div></div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Cost</th><th class="r">Profit</th></tr></thead><tbody>
    ${s.lines.map(l => `<tr><td>${esc(l.product)}</td><td class="r">${l.qty}</td><td class="r">${money(l.unit_price)}</td><td class="r">${money(l.unit_cost)}</td><td class="r">${money(l.qty * (l.unit_price - l.unit_cost))}</td></tr>`).join('')}</tbody></table>
    ${s.notes ? `<p class="note">${esc(s.notes)}</p>` : ''}
    <div class="row" style="justify-content:space-between;margin-top:18px"><button class="btn danger small" id="del">Delete sale</button><button class="btn" data-close>Close</button></div>`);
  card.querySelector('#del').onclick = function () {
    if (!this.dataset.sure) { this.dataset.sure = 1; this.textContent = 'Click again — stock goes back on the shelf'; return; }
    api('/sales/' + encodeURIComponent(s.sale_no), { method: 'DELETE' }).then(() => { closeModal(); toast('Sale deleted'); after(); });
  };
}
