import { api, toast, modal, closeModal, esc, money, qty, today, UNITS, options, categories, readFile, $ } from '../core.js';

export function render() {
  return `<div class="head"><div><h1>Purchases</h1><div class="sub">Everything that comes into the studio. Saving a purchase adds the stock to Inventory.</div></div>
    <div class="row"><button class="btn ghost" id="aiBtn" title="Coming in version 1.2">✨ Capture invoice (AI)</button><button class="btn" id="addP">+ Record a purchase</button></div></div>
    <div class="tiles" id="tiles"></div>
    <div class="card"><div class="row" style="margin-bottom:14px"><input id="q" placeholder="Search supplier, invoice number…"></div><div id="table"><div class="empty">Loading…</div></div></div>`;
}

export async function after() {
  const rows = await api('/purchases');
  const month = today().slice(0, 7);
  $('#tiles').innerHTML = `<div class="tile"><div class="k">Purchases</div><div class="v">${rows.length}</div></div>
    <div class="tile"><div class="k">Spent this month</div><div class="v">${money(rows.filter(r => r.date.startsWith(month)).reduce((a, r) => a + r.total, 0))}</div></div>
    <div class="tile"><div class="k">Spent in total</div><div class="v">${money(rows.reduce((a, r) => a + r.total, 0))}</div></div>`;
  const draw = q => {
    q = (q || '').toLowerCase();
    const list = rows.filter(r => !q || `${r.supplier} ${r.invoice_no}`.toLowerCase().includes(q));
    $('#table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Supplier</th><th>Invoice</th><th class="r">Lines</th><th class="r">Total</th></tr></thead><tbody>
      ${list.map(r => `<tr data-id="${r.id}"><td>${esc(r.date)}</td><td><b>${esc(r.supplier || '—')}</b>${r.source === 'test' ? ' <span class="pill">test</span>' : ''}</td><td>${esc(r.invoice_no || '—')}${r.file_key ? ' 📎' : ''}</td><td class="r">${r.lines}</td><td class="r">${money(r.total)}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">${rows.length ? 'Nothing matches your search.' : 'No purchases yet — click “Record a purchase”.'}</div>`;
    $('#table').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => detail(tr.dataset.id));
  };
  $('#q').oninput = e => draw(e.target.value);
  $('#addP').onclick = () => form();
  $('#aiBtn').onclick = () => modal(`<h2>✨ Capture invoice</h2><p>Soon you'll be able to snap a photo of a supplier invoice or paste its text here — the AI fills in the supplier, invoice number, date and every line for you to check before saving.</p><p class="note">Coming in version 1.2. For now, use “Record a purchase”.</p><div style="text-align:right"><button class="btn" data-close>OK</button></div>`);
  draw();
}

async function form() {
  const [mats, sups, cats] = await Promise.all([api('/materials'), api('/suppliers'), categories('material')]);
  const matOpts = `<option value="">— choose item —</option>${mats.map(m => `<option value="${m.id}" data-unit="${esc(m.unit)}">${esc(m.name)} (${esc(m.unit)})</option>`).join('')}<option value="__new">+ New item…</option>`;
  const card = modal(`<h2>Record a purchase</h2>
    <div class="grid2">
      <div class="field"><label>Supplier</label><input id="sup" list="supList" placeholder="Type or pick a supplier"><datalist id="supList">${sups.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist></div>
      <div class="field"><label>Date</label><input id="date" type="date" value="${today()}"></div>
      <div class="field"><label>Invoice / receipt number</label><input id="inv"></div>
      <div class="field"><label>Attach invoice (photo or PDF)</label><input id="file" type="file" accept="image/*,application/pdf"></div>
    </div>
    <label>Items bought</label>
    <div id="lines"></div>
    <button class="btn ghost small" id="addLine" style="margin:6px 0 14px">+ Add line</button>
    <div class="field"><label>Notes</label><input id="notes"></div>
    <div class="row" style="justify-content:space-between"><b id="tot">Total: R 0.00</b><div class="row"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="save">Save purchase</button></div></div>`);
  card.classList.add('wide');
  const addLine = () => {
    const d = document.createElement('div'); d.className = 'pline';
    d.innerHTML = `<select class="mat">${matOpts}</select>
      <div class="newmat" hidden><input class="nm" placeholder="New item name"><select class="nu">${options(UNITS.map(u => ({ value: u, label: u })), 'g')}</select><select class="nc">${options(cats.filter(c => c.active).map(c => ({ value: c.id, label: c.name })), '', 'Category')}</select></div>
      <input class="q" type="number" step="any" placeholder="Qty"><span class="u note">—</span><input class="t" type="number" step="any" placeholder="Line total R"><button class="icon-btn rm" title="Remove">✕</button>`;
    $('#lines').appendChild(d);
    const sel = d.querySelector('.mat');
    sel.onchange = () => { const nw = sel.value === '__new'; d.querySelector('.newmat').hidden = !nw; d.querySelector('.u').textContent = nw ? '' : (sel.selectedOptions[0].dataset.unit || '—'); };
    d.querySelector('.rm').onclick = () => { d.remove(); total(); };
    d.querySelector('.t').oninput = total;
  };
  const total = () => card.querySelector('#tot').textContent = 'Total: ' + money([...card.querySelectorAll('.pline .t')].reduce((a, i) => a + (Number(i.value) || 0), 0));
  card.querySelector('#addLine').onclick = addLine; addLine(); addLine();
  card.querySelector('#cancel').onclick = closeModal;
  card.querySelector('#save').onclick = async e => {
    const lines = [...card.querySelectorAll('.pline')].map(d => {
      const v = d.querySelector('.mat').value, l = { qty: d.querySelector('.q').value, line_total: d.querySelector('.t').value };
      if (v === '__new') l.new_material = { name: d.querySelector('.nm').value.trim(), unit: d.querySelector('.nu').value, category_id: d.querySelector('.nc').value };
      else l.material_id = v;
      return l;
    }).filter(l => (l.material_id || l.new_material?.name) && Number(l.qty) > 0);
    if (!lines.length) return toast('Add at least one item with a quantity', true);
    e.target.disabled = true; e.target.textContent = 'Saving…';
    try {
      const file = await readFile(card.querySelector('#file').files[0]);
      const r = await api('/purchases', { method: 'POST', body: { supplier_name: card.querySelector('#sup').value, date: card.querySelector('#date').value, invoice_no: card.querySelector('#inv').value, notes: card.querySelector('#notes').value, lines, file } });
      closeModal(); toast(r.warning || 'Purchase saved — stock updated', !!r.warning); after();
    } catch (err) { e.target.disabled = false; e.target.textContent = 'Save purchase'; }
  };
}

async function detail(id) {
  const { purchase: p, lines } = await api('/purchases/' + id);
  const isImg = p.file_key && !/pdf/i.test(p.file_key);
  const card = modal(`<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>${esc(p.supplier || 'Purchase')}</h2><div class="note">${esc(p.date)}${p.invoice_no ? ' · Invoice ' + esc(p.invoice_no) : ''}</div></div><div style="font:500 26px 'Cormorant Garamond',serif">${money(p.total)}</div></div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Line total</th><th class="r">Per unit</th></tr></thead><tbody>
    ${lines.map(l => `<tr><td>${esc(l.material || l.description)}</td><td class="r">${qty(l.qty, l.unit)}</td><td class="r">${money(l.line_total)}</td><td class="r">${l.qty ? money(l.line_total / l.qty) : '—'}</td></tr>`).join('')}</tbody></table>
    ${p.notes ? `<p class="note">${esc(p.notes)}</p>` : ''}
    <div style="margin-top:12px">${p.file_key ? `<a class="btn ghost small" href="/api/files/${encodeURIComponent(p.file_key)}" target="_blank">📎 Open attached invoice</a>` : `<label class="btn ghost small" style="text-transform:none;letter-spacing:0;color:var(--teal-d);margin:0">📎 Attach invoice<input type="file" id="att" accept="image/*,application/pdf" hidden></label>`}</div>
    <div class="row" style="justify-content:space-between;margin-top:18px"><button class="btn danger small" id="del">Delete purchase</button><button class="btn" data-close>Close</button></div>`);
  const att = card.querySelector('#att');
  if (att) att.onchange = async () => { await api(`/purchases/${id}/file`, { method: 'POST', body: { file: await readFile(att.files[0]), name: att.files[0].name } }); toast('Invoice attached'); detail(id); after(); };
  card.querySelector('#del').onclick = function () {
    if (!this.dataset.sure) { this.dataset.sure = 1; this.textContent = 'Click again — this removes the stock too'; return; }
    api('/purchases/' + id, { method: 'DELETE' }).then(() => { closeModal(); toast('Purchase deleted'); after(); });
  };
}
