import { captureModal } from '../capture.js';
import { api, toast, modal, closeModal, esc, money, qty, today, UNITS, options, categories, readFile, convert, $ } from '../core.js';

export function render() {
  return `<div class="head"><div><h1>Purchases</h1><div class="sub">Everything that comes into the studio. Saving a purchase adds the stock to Inventory.</div></div>
    <div class="row"><button class="btn ghost" id="aiBtn">✨ Capture invoice (AI)</button><button class="btn" id="addP">+ Record a purchase</button></div></div>
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
  $('#aiBtn').onclick = capture;
  draw();
}

async function form(pre = null) {
  const [mats, sups, cats] = await Promise.all([api('/materials'), api('/suppliers'), categories('material')]);
  const matOpts = `<option value="">— choose item —</option>${mats.map(m => `<option value="${m.id}" data-unit="${esc(m.unit)}">${esc(m.name)} (${esc(m.unit)})</option>`).join('')}<option value="__new">+ New item…</option>`;
  const card = modal(`<h2>${pre ? '✨ Check the AI\'s reading' : 'Record a purchase'}</h2>
    ${pre ? `<div class="box aibox"><b>Filled in by AI — please check every line before saving.</b>${pre.notes ? `<div class="note" style="margin-top:4px">AI note: ${esc(pre.notes)}</div>` : ''}${pre.total ? `<div class="note">Invoice total: ${money(pre.total)}${pre.delivery_fee ? ' (incl. delivery ' + money(pre.delivery_fee) + ')' : ''}</div>` : ''}
      ${pre.delivery_fee > 0 ? `<label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);margin:8px 0 0"><input type="checkbox" id="delv" checked style="width:auto"> Record the ${money(pre.delivery_fee)} delivery as an expense (Courier)</label>` : ''}</div>` : ''}
    <div class="grid2">
      <div class="field"><label>Supplier</label><input id="sup" list="supList" placeholder="Type or pick a supplier"><datalist id="supList">${sups.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist></div>
      <div class="field"><label>Date</label><input id="date" type="date" value="${today()}"></div>
      <div class="field"><label>Invoice / receipt number</label><input id="inv"></div>
      <div class="field"><label>Attach invoice (photo or PDF)</label>${pre?.file ? '<div class="note" style="padding:10px 0">📎 The invoice you captured will be attached.</div>' : '<input id="file" type="file" accept="image/*,application/pdf">'}</div>
    </div>
    <label>Items bought</label>
    <div id="lines"></div>
    <button class="btn ghost small" id="addLine" style="margin:6px 0 14px">+ Add line</button>
    <div class="field"><label>Notes</label><input id="notes"></div>
    <div id="dup"></div>
    <div class="row" style="justify-content:space-between"><b id="tot">Total: R 0.00</b><div class="row"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="save">Save purchase</button></div></div>`);
  card.classList.add('wide');
  let allowDup = false;
  const dupHtml = d => `<div class="box dupbox">⚠ <b>This looks like a duplicate</b> of ${d.length > 1 ? 'purchases' : 'a purchase'} already recorded:<ul>${d.map(x => `<li>${esc(x.supplier || 'No supplier')} · ${esc(x.date)} · ${x.invoice_no ? 'invoice ' + esc(x.invoice_no) : 'no invoice no.'} · ${money(x.total)} <span class="note">(${esc(x.reason)})</span></li>`).join('')}</ul></div>`;
  const values = () => ({ supplier_name: card.querySelector('#sup').value, invoice_no: card.querySelector('#inv').value, date: card.querySelector('#date').value,
    total: [...card.querySelectorAll('.pline .t')].reduce((a, i) => a + (Number(i.value) || 0), 0) });
  const checkDup = async () => (await api('/purchases/check', { method: 'POST', body: values() })).duplicates;
  const addLine = (init = {}) => {
    const d = document.createElement('div'); d.className = 'pline' + (init.flag ? ' flag' : '');
    d.innerHTML = `<select class="mat">${matOpts}</select>
      <div class="newmat" hidden><input class="nm" placeholder="New item name"><select class="nu">${options(UNITS.map(u => ({ value: u, label: u })), 'g')}</select><select class="nc">${options(cats.filter(c => c.active).map(c => ({ value: c.id, label: c.name })), '', 'Category')}</select></div>
      <input class="q" type="number" step="any" placeholder="Qty"><span class="u note">—</span><input class="t" type="number" step="any" placeholder="Line total R"><button class="icon-btn rm" title="Remove">✕</button>`;
    $('#lines').appendChild(d);
    const sel = d.querySelector('.mat');
    sel.onchange = () => { const nw = sel.value === '__new'; d.querySelector('.newmat').hidden = !nw; d.querySelector('.u').textContent = nw ? '' : (sel.selectedOptions[0].dataset.unit || '—'); };
    if (init.material_id) sel.value = init.material_id;
    if (init.new_material) { sel.value = '__new'; d.querySelector('.nm').value = init.new_material.name; d.querySelector('.nu').value = init.new_material.unit; if (init.new_material.category_id) d.querySelector('.nc').value = init.new_material.category_id; }
    if (init.qty != null) d.querySelector('.q').value = init.qty;
    if (init.line_total != null) d.querySelector('.t').value = init.line_total;
    if (init.flag) { const f = document.createElement('div'); f.className = 'note flagnote'; f.textContent = init.flag; d.appendChild(f); }
    sel.onchange();
    d.querySelector('.rm').onclick = () => { d.remove(); total(); };
    d.querySelector('.t').oninput = total;
  };
  const total = () => card.querySelector('#tot').textContent = 'Total: ' + money([...card.querySelectorAll('.pline .t')].reduce((a, i) => a + (Number(i.value) || 0), 0));
  card.querySelector('#addLine').onclick = () => addLine();
  if (pre) {
    card.querySelector('#sup').value = pre.supplier_name || ''; card.querySelector('#inv').value = pre.invoice_number || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(pre.date || '')) card.querySelector('#date').value = pre.date;
    pre.lines.forEach(addLine); total();
    checkDup().then(d => { if (d.length) card.querySelector('.aibox').insertAdjacentHTML('afterend', dupHtml(d)); }).catch(() => { });
  } else { addLine(); addLine(); }
  card.querySelector('#cancel').onclick = closeModal;
  card.querySelector('#save').onclick = async e => {
    const lines = [...card.querySelectorAll('.pline')].map(d => {
      const v = d.querySelector('.mat').value, l = { qty: d.querySelector('.q').value, line_total: d.querySelector('.t').value };
      if (v === '__new') l.new_material = { name: d.querySelector('.nm').value.trim(), unit: d.querySelector('.nu').value, category_id: d.querySelector('.nc').value };
      else l.material_id = v;
      return l;
    }).filter(l => (l.material_id || l.new_material?.name) && Number(l.qty) > 0);
    if (!lines.length) return toast('Add at least one item with a quantity', true);
    if (!allowDup) {
      const d = await checkDup().catch(() => []);
      if (d.length) {
        card.querySelector('#dup').innerHTML = dupHtml(d) + `<div class="row" style="justify-content:flex-end;margin:-6px 0 12px"><button class="btn ghost small" id="dupNo">Don't save</button><button class="btn small danger" id="dupYes">It's a different invoice — save anyway</button></div>`;
        card.querySelector('#dupNo').onclick = closeModal;
        card.querySelector('#dupYes').onclick = () => { allowDup = true; card.querySelector('#dup').innerHTML = ''; card.querySelector('#save').click(); };
        card.querySelector('#dup').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    e.target.disabled = true; e.target.textContent = 'Saving…';
    try {
      const file = pre?.file || await readFile(card.querySelector('#file').files[0]);
      const r = await api('/purchases', { method: 'POST', body: { supplier_name: card.querySelector('#sup').value, date: card.querySelector('#date').value, invoice_no: card.querySelector('#inv').value, notes: card.querySelector('#notes').value, lines, file, allow_duplicate: allowDup } });
      const delv = card.querySelector('#delv');
      if (delv?.checked) await api('/expenses', { method: 'POST', body: { date: card.querySelector('#date').value, amount: pre.delivery_fee, category: 'Courier', description: `Delivery — ${card.querySelector('#sup').value} ${card.querySelector('#inv').value}`.trim() } });
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

// ---------- ✨ AI invoice capture ----------
function capture() {
  captureModal({ title: '✨ Capture invoice', endpoint: '/ai/invoice',
    intro: 'Take a photo of the invoice, upload the PDF, or paste the text from an email. The AI fills in the purchase — you check it before anything is saved.',
    textLabel: '…or paste the invoice text', textPlaceholder: 'Paste from an email or web order confirmation',
    onResult: async (ai, file) => { const pre = await prepare(ai); pre.file = file; form(pre); } });
}

// Turn the AI's reading into purchase-form lines matched to Sian's inventory
async function prepare(ai) {
  const [mats, cats] = await Promise.all([api('/materials'), categories('material')]);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const lines = (ai.lines || []).map(l => {
    let m = l.match && mats.find(x => norm(x.name) === norm(l.match));
    if (!m) m = mats.find(x => norm(x.name) === norm(l.description));
    let flag = '';
    if (m) {
      let q = convert(Number(l.quantity) || 0, l.unit, m.unit);
      if (q == null) { q = Number(l.quantity) || 0; flag = `Check the quantity — invoice says ${l.quantity} ${l.unit}, “${m.name}” is counted in ${m.unit}.`; }
      else if (l.unit !== m.unit && !((l.unit === 'kg' && m.unit === 'g') || (l.unit === 'l' && m.unit === 'ml') || (l.unit === 'g' && m.unit === 'kg') || (l.unit === 'ml' && m.unit === 'l'))) flag = `Converted ${l.quantity} ${l.unit} to ${m.unit} (1 g ≈ 1 ml) — please check.`;
      return { material_id: m.id, qty: Math.round(q * 1000) / 1000, line_total: l.line_total, flag };
    }
    const cat = cats.find(c => c.active && norm(c.name) === norm(l.category));
    return { new_material: { name: l.description, unit: ['g', 'kg', 'ml', 'l', 'each', 'pack'].includes(l.unit) ? l.unit : 'each', category_id: cat ? cat.id : '' }, qty: l.quantity, line_total: l.line_total, flag: 'New item — not in your inventory yet. Check the name and unit.' };
  });
  return { ...ai, lines };
}
