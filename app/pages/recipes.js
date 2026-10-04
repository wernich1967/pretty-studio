import { api, toast, modal, closeModal, esc, money, qty, UNITS, options, categories, readFile, convert, approx, $ } from '../core.js';

export function render() {
  return `<div class="head"><div><h1>Recipes</h1><div class="sub">Your formulas — with live cost per batch from what you actually paid.</div></div><button class="btn" id="addR">+ New recipe</button></div>
    <div class="card"><div class="row" style="margin-bottom:14px"><input id="q" placeholder="Search recipes…"></div><div id="grid" class="rgrid"><div class="empty">Loading…</div></div></div>`;
}
export async function after() {
  const rows = await api('/recipes');
  const draw = q => {
    q = (q || '').toLowerCase(); const list = rows.filter(r => !q || r.name.toLowerCase().includes(q));
    $('#grid').innerHTML = list.length ? list.map(r => `<div class="rcard" data-id="${r.id}">
      <div class="rimg" style="${r.image_key ? `background-image:url('/api/files/${encodeURIComponent(r.image_key)}')` : ''}">${r.image_key ? '' : '<span>No photo</span>'}</div>
      <div class="rbody"><b>${esc(r.name)}</b>${r.source === 'test' ? ' <span class="pill">test</span>' : ''}<div class="note">${esc(r.category || 'No category')} · ${r.lines} ingredients${r.yield_qty ? ' · ' + qty(r.yield_qty, r.yield_unit) : ''}</div></div></div>`).join('')
      : `<div class="empty" style="grid-column:1/-1">${rows.length ? 'Nothing matches.' : 'No recipes yet — click “New recipe”.'}</div>`;
    $('#grid').querySelectorAll('.rcard').forEach(c => c.onclick = () => detail(c.dataset.id));
  };
  $('#q').oninput = e => draw(e.target.value);
  $('#addR').onclick = () => form();
  draw();
}

export function lineCost(l) {
  if (!l.material_id || !l.avg_cost) return null;
  const q = convert(l.qty, l.unit, l.material_unit); return q == null ? null : q * l.avg_cost;
}

async function detail(id) {
  const { recipe: r, lines } = await api('/recipes/' + id);
  const costs = lines.map(lineCost), known = costs.filter(c => c != null), total = known.reduce((a, c) => a + c, 0);
  const card = modal(`${r.image_key ? `<img src="/api/files/${encodeURIComponent(r.image_key)}" class="rhero">` : ''}
    <h2>${esc(r.name)}</h2><div class="note">${esc(r.category || 'No category')}${r.product ? ' · makes ' + esc(r.product) : ''}${r.yield_qty ? ' · batch ' + qty(r.yield_qty, r.yield_unit) : ''}</div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Ingredient</th><th class="r">Amount</th><th class="r">In stock</th><th class="r">Cost</th></tr></thead><tbody>
    ${lines.map((l, i) => `<tr><td>${esc(l.material || l.description)}${l.material_id ? '' : ' <span class="pill red" title="Not linked to an inventory item — won\'t be taken from stock">not linked</span>'}</td><td class="r">${qty(l.qty, l.unit)}</td>
      <td class="r">${l.material_id ? qty(l.stock, l.material_unit) : '—'}</td><td class="r">${costs[i] != null ? money(costs[i]) + (approx(l.unit, l.material_unit) ? '<span class="note" title="1 g taken as 1 ml"> ≈</span>' : '') : '—'}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="3"><b>Estimated cost per batch</b>${known.length < lines.length ? ' <span class="note">(' + (lines.length - known.length) + ' ingredient(s) without a cost)</span>' : ''}</td><td class="r"><b>${money(total)}</b></td></tr></tfoot></table>
    ${r.method ? `<h3 style="margin:14px 0 4px">Method</h3><p style="white-space:pre-wrap;margin:0">${esc(r.method)}</p>` : ''}
    ${r.notes ? `<h3 style="margin:14px 0 4px">Notes</h3><p class="note" style="white-space:pre-wrap;margin:0">${esc(r.notes)}</p>` : ''}
    <div class="row" style="justify-content:space-between;margin-top:18px;flex-wrap:wrap"><button class="btn danger small" id="del">Delete</button>
      <div class="row"><button class="btn ghost" id="edit">Edit</button><a class="btn" href="#/batches?recipe=${r.id}">Make a batch</a></div></div>`);
  card.classList.add('wide');
  card.querySelector('#edit').onclick = () => form(r, lines);
  card.querySelector('#del').onclick = function () {
    if (!this.dataset.sure) { this.dataset.sure = 1; this.textContent = 'Click again to confirm'; return; }
    api('/recipes/' + id, { method: 'DELETE' }).then(x => { closeModal(); toast(x.hidden ? x.message : 'Recipe deleted'); after(); });
  };
}

async function form(r = {}, lines = []) {
  const [mats, prods, cats] = await Promise.all([api('/materials'), api('/products'), categories('product')]);
  const matOpts = sel => `<option value="">— not linked (free text) —</option>${mats.map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)} (${esc(m.unit)})</option>`).join('')}`;
  const card = modal(`<h2>${r.id ? 'Edit recipe' : 'New recipe'}</h2>
    <div class="grid2">
      <div class="field"><label>Recipe name</label><input id="name" value="${esc(r.name)}"></div>
      <div class="field"><label>Category</label><select id="cat">${options(cats.filter(c => c.active || c.id === r.category_id).map(c => ({ value: c.id, label: c.name })), r.category_id, '— choose —')}</select></div>
      <div class="field"><label>Makes finished product</label><select id="prod">${options(prods.map(p => ({ value: p.id, label: p.name })), r.product_id, '— none / choose later —')}</select></div>
      <div class="field"><label>Batch size</label><div class="row"><input id="yq" type="number" step="any" value="${r.yield_qty ?? ''}" placeholder="e.g. 500"><select id="yu" style="width:90px">${options(UNITS.map(u => ({ value: u, label: u })), r.yield_unit || 'g')}</select></div></div>
    </div>
    <label>Ingredients</label><div class="note" style="margin-bottom:6px">Link each line to an inventory item so batches take it from stock and the cost is worked out.</div>
    <div id="lines"></div><button class="btn ghost small" id="addLine" style="margin:6px 0 14px">+ Add ingredient</button>
    <div class="field"><label>Method</label><textarea id="method" rows="3">${esc(r.method)}</textarea></div>
    <div class="field"><label>Notes</label><textarea id="notes" rows="2">${esc(r.notes)}</textarea></div>
    <div class="field"><label>Photo</label><input id="img" type="file" accept="image/*"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="save">Save recipe</button></div>`);
  card.classList.add('wide');
  const add = (l = {}) => {
    const d = document.createElement('div'); d.className = 'pline';
    d.innerHTML = `<select class="mat">${matOpts(l.material_id)}</select><input class="desc" placeholder="Ingredient name" value="${esc(l.material_id ? '' : l.description)}" ${l.material_id ? 'hidden' : ''}>
      <input class="q" type="number" step="any" placeholder="Amount" value="${l.qty ?? ''}"><select class="u" style="width:80px">${options(UNITS.map(u => ({ value: u, label: u })), l.unit || 'g')}</select><button class="icon-btn rm">✕</button>`;
    d.querySelector('.mat').onchange = e => d.querySelector('.desc').hidden = !!e.target.value;
    d.querySelector('.rm').onclick = () => d.remove();
    $('#lines').appendChild(d);
  };
  (lines.length ? lines : [{}, {}, {}]).forEach(add);
  card.querySelector('#addLine').onclick = () => add();
  card.querySelector('#cancel').onclick = closeModal;
  card.querySelector('#save').onclick = async e => {
    const body = { name: $('#name').value, category_id: $('#cat').value, product_id: $('#prod').value, yield_qty: $('#yq').value, yield_unit: $('#yu').value, method: $('#method').value, notes: $('#notes').value,
      lines: [...card.querySelectorAll('.pline')].map(d => ({ material_id: d.querySelector('.mat').value, description: d.querySelector('.desc').value, qty: d.querySelector('.q').value, unit: d.querySelector('.u').value })) };
    e.target.disabled = true;
    try {
      body.image = await readFile($('#img').files[0]);
      const x = await api(r.id ? '/recipes/' + r.id : '/recipes', { method: r.id ? 'PUT' : 'POST', body });
      toast('Recipe saved'); await after(); detail(x.id || r.id);
    } catch { e.target.disabled = false; }
  };
}
