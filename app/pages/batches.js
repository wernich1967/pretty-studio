import { api, toast, modal, closeModal, esc, money, qty, today, options, convert, approx, $ } from '../core.js';

export function render() {
  return `<div class="head"><div><h1>Make a batch</h1><div class="sub">Making a batch takes the ingredients out of stock and adds the finished products to stock.</div></div><button class="btn" id="addB">+ Make a batch</button></div>
    <div class="card"><h2>Batch history</h2><div id="table"><div class="empty">Loading…</div></div></div>`;
}
export async function after() {
  const rows = await api('/batches');
  const t = today();
  $('#table').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Batch no.</th><th>Date</th><th>Recipe / product</th><th class="r">Made</th><th class="r">Cost</th><th>Best before</th></tr></thead><tbody>
    ${rows.map(b => `<tr data-id="${b.id}"><td><b>${esc(b.batch_no)}</b>${b.status === 'curing' && b.ready_date > t ? ' <span class="pill">curing until ' + esc(b.ready_date) + '</span>' : ''}</td><td>${esc(b.date)}</td><td>${esc(b.recipe || '—')}<div class="note">${esc(b.product || '')}</div></td>
      <td class="r">${b.qty_made || '—'}</td><td class="r">${money(b.cost_total)}</td><td>${b.best_before ? (b.best_before < t ? '<span class="pill red">' + esc(b.best_before) + '</span>' : esc(b.best_before)) : '—'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">No batches yet. Open a recipe and click “Make a batch”, or use the button above.</div>';
  $('#table').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => detail(tr.dataset.id));
  $('#addB').onclick = () => form();
  const m = location.hash.match(/recipe=([^&]+)/);
  if (m) { history.replaceState(null, '', '#/batches'); form(m[1]); }
}

async function form(recipeId) {
  const [recipes, prods, mats] = await Promise.all([api('/recipes'), api('/products'), api('/materials')]);
  const card = modal(`<h2>Make a batch</h2>
    <div class="grid2">
      <div class="field"><label>Recipe</label><select id="rec">${options(recipes.map(r => ({ value: r.id, label: r.name })), recipeId, '— choose a recipe —')}</select></div>
      <div class="field"><label>How many batches</label><input id="mult" type="number" step="any" value="1" min="0"></div>
    </div>
    <div id="ing"><div class="empty">Choose a recipe to see what it uses.</div></div>
    <div class="grid2" style="margin-top:14px">
      <div class="field"><label>Finished product made</label><select id="prod">${options(prods.map(p => ({ value: p.id, label: p.name })), '', '— choose —')}</select></div>
      <div class="field"><label>How many did you make?</label><input id="made" type="number" step="any" placeholder="e.g. 12 bottles"></div>
      <div class="field"><label>Date made</label><input id="date" type="date" value="${today()}"></div>
      <div class="field"><label>Ready to sell from <span class="note" style="text-transform:none;letter-spacing:0">(if it needs curing)</span></label><input id="ready" type="date"></div>
      <div class="field"><label>Best before</label><input id="bb" type="date"></div>
      <div class="field"><label>Notes</label><input id="notes"></div>
    </div>
    <label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--text)"><input type="checkbox" id="upd" checked style="width:auto"> Update the product's cost to this batch's cost per item</label>
    <div class="box" id="sum" style="margin-top:12px"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="save">Record batch</button></div>`);
  card.classList.add('wide');
  let lines = [];
  const load = async () => {
    const id = $('#rec').value; if (!id) { lines = []; $('#ing').innerHTML = '<div class="empty">Choose a recipe to see what it uses.</div>'; return sum(); }
    const d = await api('/recipes/' + id); lines = d.lines;
    if (d.recipe.product_id) $('#prod').value = d.recipe.product_id;
    draw();
  };
  const draw = () => {
    const k = Number($('#mult').value) || 0;
    $('#ing').innerHTML = `<table class="tbl"><thead><tr><th>Ingredient</th><th class="r">Recipe</th><th>Take from stock</th><th class="r">Available</th></tr></thead><tbody>
      ${lines.map((l, i) => {
        const need = l.material_id ? convert(l.qty * k, l.unit, l.material_unit) : null;
        return `<tr><td>${esc(l.material || l.description)}${!l.material_id ? '<div class="note">not linked — pick an item to take it from stock</div>' : ''}</td><td class="r">${qty(l.qty * k, l.unit)}</td>
        <td><div class="row" style="gap:6px">${l.material_id ? '' : `<select class="pick" data-i="${i}" style="min-width:140px"><option value="">— skip —</option>${mats.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>`}
          <input class="take" data-i="${i}" type="number" step="any" style="width:100px" value="${need != null ? Math.round(need * 1000) / 1000 : ''}" ${l.material_id ? '' : 'disabled'}><span class="note">${esc(l.material_unit || '')}${l.material_id && approx(l.unit, l.material_unit) ? ' ≈' : ''}</span></div></td>
        <td class="r ${l.material_id && need > l.stock ? 'warn' : ''}">${l.material_id ? qty(l.stock, l.material_unit) : '—'}</td></tr>`;
      }).join('')}</tbody></table><div class="note" style="margin-top:4px">≈ means grams and millilitres were treated as equal — adjust the amount if needed.</div>`;
    card.querySelectorAll('.pick').forEach(s => s.onchange = () => {
      const l = lines[s.dataset.i], m = mats.find(x => x.id === s.value);
      l.pick = m || null; const inp = card.querySelector(`.take[data-i="${s.dataset.i}"]`);
      inp.disabled = !m; inp.nextElementSibling.textContent = m ? m.unit : '';
      const c = m ? convert(l.qty * k, l.unit, m.unit) : null; inp.value = c != null ? Math.round(c * 1000) / 1000 : '';
      sum();
    });
    card.querySelectorAll('.take').forEach(i => i.oninput = sum);
    sum();
  };
  const sum = () => {
    let cost = 0, short = [];
    card.querySelectorAll('.take').forEach(inp => {
      const l = lines[inp.dataset.i], q = Number(inp.value) || 0; if (inp.disabled || !q) return;
      const avg = l.material_id ? l.avg_cost : l.pick?.avg_cost, stock = l.material_id ? l.stock : l.pick?.stock;
      cost += q * (avg || 0); if (q > stock + 1e-9) short.push(l.material || l.pick?.name);
    });
    const made = Number($('#made').value) || 0;
    $('#sum').innerHTML = `Batch cost <b>${money(cost)}</b>${made ? ` · cost per item <b>${money(cost / made)}</b>` : ''}${short.length ? `<div style="color:var(--rose);margin-top:4px">Not enough in stock: ${short.map(esc).join(', ')}</div>` : ''}`;
  };
  $('#rec').onchange = load; $('#mult').oninput = draw; $('#made').oninput = sum;
  card.querySelector('#cancel').onclick = closeModal;
  card.querySelector('#save').onclick = async e => {
    const used = [...card.querySelectorAll('.take')].filter(i => !i.disabled && Number(i.value) > 0).map(i => { const l = lines[i.dataset.i]; return { material_id: l.material_id || l.pick?.id, qty: Number(i.value) }; });
    e.target.disabled = true;
    try {
      const r = await api('/batches', { method: 'POST', body: { recipe_id: $('#rec').value, product_id: $('#prod').value, qty_made: $('#made').value, date: $('#date').value, ready_date: $('#ready').value, best_before: $('#bb').value, notes: $('#notes').value, update_cost: $('#upd').checked, lines: used } });
      closeModal(); toast(`Batch ${r.batch_no} recorded`); after();
    } catch { e.target.disabled = false; }
  };
  if (recipeId) load(); else sum();
}

async function detail(id) {
  const { batch: b, used } = await api('/batches/' + id);
  const card = modal(`<h2>Batch ${esc(b.batch_no)}</h2><div class="note">${esc(b.date)} · ${esc(b.recipe || 'No recipe')}${b.product ? ' → ' + esc(b.product) : ''}</div>
    <div class="tiles" style="margin-top:14px"><div class="tile"><div class="k">Made</div><div class="v">${b.qty_made || 0}</div></div><div class="tile"><div class="k">Batch cost</div><div class="v">${money(b.cost_total)}</div></div>
      <div class="tile"><div class="k">Per item</div><div class="v">${b.qty_made ? money(b.cost_total / b.qty_made) : '—'}</div></div></div>
    ${b.best_before || b.ready_date ? `<p class="note">${b.ready_date ? 'Ready from ' + esc(b.ready_date) + '. ' : ''}${b.best_before ? 'Best before ' + esc(b.best_before) + '.' : ''}</p>` : ''}
    <h3 style="margin:8px 0 4px">Ingredients used</h3>
    <div class="list">${used.map(u => `<div class="li"><span class="name">${esc(u.name)}</span><span>${qty(-u.qty, u.unit)}</span><span class="note" style="width:90px;text-align:right">${money(-u.qty * u.unit_cost)}</span></div>`).join('') || '<div class="empty">None recorded.</div>'}</div>
    ${b.notes ? `<p class="note">${esc(b.notes)}</p>` : ''}
    <div class="row" style="justify-content:space-between;margin-top:18px"><button class="btn danger small" id="del">Undo batch</button><button class="btn" data-close>Close</button></div>`);
  card.querySelector('#del').onclick = function () {
    if (!this.dataset.sure) { this.dataset.sure = 1; this.textContent = 'Click again — puts ingredients back, removes the products'; return; }
    api('/batches/' + id, { method: 'DELETE' }).then(() => { closeModal(); toast('Batch undone'); after(); });
  };
}
