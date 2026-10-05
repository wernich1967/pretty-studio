// Getting started — the setup wizard shown on first login (and any time from the menu).
import { api, toast, esc, state, money, qty, today, $ } from '../core.js';
import { startTour, MAIN_TOUR } from '../tour.js';

const STEPS = [
  { id: 'welcome', title: 'Welcome', sub: 'How the studio works' },
  { id: 'business', title: 'Your business', sub: 'Name and contact details' },
  { id: 'categories', title: 'Categories', sub: 'What you make and buy' },
  { id: 'stock', title: 'Opening stock', sub: 'What is on your shelves today' },
  { id: 'recipe', title: 'First recipe', sub: 'How you make a product' },
  { id: 'batch', title: 'First batch', sub: 'Make it — stock updates itself' },
  { id: 'sale', title: 'First sale', sub: 'Sell it — see your profit' }
];
const view = { step: null };
let st = null, ctx = {};

export function render() {
  return `<div class="head"><div><h1>Getting started</h1><div class="sub">Set up your studio step by step. Your progress is saved — stop any time and carry on later.</div></div></div>
    <div class="wiz"><aside class="wsteps" id="wSteps"><div class="empty">Loading…</div></aside><section class="card wpanel" id="wPanel"></section></div>`;
}

export async function after(c) {
  ctx = c || {};
  await refresh();
  if (!view.step || !STEPS.some(s => s.id === view.step)) view.step = (STEPS.find(s => !st.done[s.id]) || STEPS[0]).id;
  draw();
}

async function refresh() {
  st = await api('/onboarding'); state.onb = st;
  ctx.renderNav?.();
}
const go = id => { view.step = id; draw(); window.scrollTo(0, 0); };
const nextOf = id => { const i = STEPS.findIndex(s => s.id === id); return (STEPS.slice(i + 1).find(s => !st.done[s.id]) || STEPS.slice(i + 1)[0] || STEPS.find(s => !st.done[s.id]))?.id; };
async function mark(step) { await api('/onboarding', { method: 'PUT', body: { step, done: true } }); await refresh(); }

function draw() {
  const pct = Math.round(st.doneCount / st.total * 100);
  $('#wSteps').innerHTML = `<div class="wprog"><div class="note"><b>${st.doneCount} of ${st.total}</b> done</div><div class="prog"><div style="width:${pct}%"></div></div></div>
    ${STEPS.map((s, i) => `<button class="wstep ${s.id === view.step ? 'on' : ''} ${st.done[s.id] ? 'done' : ''}" data-id="${s.id}">
      <span class="dot">${st.done[s.id] ? '✓' : i + 1}</span><span><b>${s.title}</b><span class="note">${s.sub}</span></span></button>`).join('')}
    <button class="linkbtn" id="wHide">${st.complete ? 'Hide this guide' : 'Hide the guide for now'}</button>`;
  $('#wSteps').querySelectorAll('.wstep').forEach(b => b.onclick = () => go(b.dataset.id));
  $('#wHide').onclick = async () => { await api('/onboarding', { method: 'PUT', body: { hidden: true } }); await refresh(); toast('Guide hidden — find it again under “Getting started” in the menu'); location.hash = '#/overview'; };
  const panel = $('#wPanel');
  const r = PANELS[view.step](panel);
  const finish = () => { if (st.complete && !panel.querySelector('#wFinish')) { panel.insertAdjacentHTML('afterbegin', finishCard()); wireFinish(panel); } };
  if (r?.then) r.then(finish); else finish();
}

const doneBadge = id => st.done[id] ? '<span class="pill">✓ done</span>' : '';
const nextBtn = (id, label = 'Next step →') => { const n = nextOf(id); return n && n !== id ? `<button class="btn" data-next="${n}">${label}</button>` : ''; };
function wireNext(box) { box.querySelectorAll('[data-next]').forEach(b => b.onclick = () => go(b.dataset.next)); }
function finishCard() {
  return st.complete ? `<div class="box wdone" style="margin-bottom:16px"><b>🎉 You're all set up!</b> Pretty Studio now knows your stock, your recipes and your prices. From here it's simply buy → make → sell.
    <div style="margin-top:10px"><button class="btn small" id="wFinish">Finish and go to Overview</button></div></div>` : '';
}
function wireFinish(box) {
  const b = box.querySelector('#wFinish'); if (!b) return;
  b.onclick = async () => { await api('/onboarding', { method: 'PUT', body: { hidden: true } }); await refresh(); location.hash = '#/overview'; };
}

const PANELS = {
  welcome(box) {
    const name = state.me?.business?.ownerName;
    box.innerHTML = `<h2>Welcome${name ? ', ' + esc(name) : ''} ${doneBadge('welcome')}</h2>
      <p>Pretty Studio keeps track of everything you buy, make and sell — so you always know what's on the shelf, what each bottle costs you, and what you're really earning.</p>
      <div class="flow">
        <div><b>1 · Buy</b><span class="note">Record a supplier invoice in <i>Purchases</i> — ingredients go into stock. ✨ The AI can read the invoice for you.</span></div>
        <div><b>2 · Make</b><span class="note">Pick a recipe in <i>Batches</i> — ingredients come out of stock, finished products go in, with a batch number and best-before date.</span></div>
        <div><b>3 · Sell</b><span class="note">Record a sale — products leave stock and the studio works out your profit.</span></div>
      </div>
      <p class="note">This guide takes about 15 minutes. The first three steps set things up; the last three walk you through the real thing once.</p>
      <div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn ghost" id="wTour">Show me around (1 min)</button><button class="btn" id="wGo">${st.done.welcome ? 'Next →' : 'Let\'s start →'}</button></div>`;
    box.querySelector('#wGo').onclick = async () => { await mark('welcome'); go(nextOf('welcome')); };
    box.querySelector('#wTour').onclick = () => startTour(MAIN_TOUR, () => { location.hash = '#/setup'; });
  },

  business(box) {
    const b = state.me?.business || {};
    box.innerHTML = `<h2>Your business ${doneBadge('business')}</h2><p class="note" style="margin-top:-4px">Used for the greeting and at the bottom of every page. You can change it later in Settings.</p>
      <div class="grid2">
        <div class="field"><label>Business name</label><input id="bName" value="${esc(b.name || 'Pretty')}"></div>
        <div class="field"><label>Your name</label><input id="bOwner" value="${esc(b.ownerName)}" placeholder="e.g. Sian"></div>
        <div class="field"><label>Phone</label><input id="bPhone" value="${esc(b.phone)}"></div>
        <div class="field"><label>Email</label><input id="bEmail" type="email" value="${esc(b.email)}"></div>
      </div>
      <div class="field"><label>Address</label><textarea id="bAddr" rows="2">${esc(b.address)}</textarea></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="bSave">Save and continue →</button></div>`;
    box.querySelector('#bSave').onclick = async () => {
      if (!$('#bOwner').value.trim()) { toast('Please add your name', true); $('#bOwner').focus(); return; }
      state.me.business = await api('/settings/business', { method: 'PUT', body: { name: $('#bName').value, ownerName: $('#bOwner').value, phone: $('#bPhone').value, email: $('#bEmail').value, address: $('#bAddr').value } });
      await mark('business'); toast('Details saved'); go(nextOf('business'));
    };
  },

  async categories(box) {
    box.innerHTML = `<h2>Categories ${doneBadge('categories')}</h2>
      <p class="note" style="margin-top:-4px">Categories keep your lists tidy. We've started you off — remove what you don't need and add your own. Planning perfumes? Add a “Perfume” category.</p>
      <div class="grid2"><div><h3>What you make</h3><div id="cc-product" class="chips"></div></div><div><h3>What you buy</h3><div id="cc-material" class="chips"></div></div></div>
      <p class="note">You can rename and re-order these any time in Settings.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="cOk">These look right →</button></div>`;
    box.querySelector('#cOk').onclick = async () => { await mark('categories'); go(nextOf('categories')); };
    await Promise.all(['product', 'material'].map(k => chips(k)));
  },

  stock(box) {
    box.innerHTML = `<h2>Opening stock ${doneBadge('stock')}</h2>
      <p class="note" style="margin-top:-4px">Tell the studio what you have today. From now on stock moves by itself as you buy, make and sell.</p>
      ${st.done.stock ? `<div class="box">You have <b>${st.counts.materials}</b> inventory item${st.counts.materials === 1 ? '' : 's'} and <b>${st.counts.products}</b> finished product${st.counts.products === 1 ? '' : 's'}. Import another sheet below, or carry on.</div>` : ''}
      <div class="grid2 wopts">
        <div class="box"><b>Import your spreadsheet</b><div class="note">Excel or CSV — the quickest way if you already keep a stock list.</div></div>
        <div class="box"><b>Or add items one by one</b><div class="note">Add each item with its opening stock in <a href="#/inventory">Ingredients & supplies</a> (ingredients & supplies) or <a href="#/products">Finished products</a>.</div></div>
      </div>
      <div id="imp"></div>
      <div class="row" style="justify-content:flex-end;margin-top:6px">${st.done.stock ? nextBtn('stock') : '<button class="btn ghost" data-next="recipe">Skip for now</button>'}</div>`;
    wireNext(box);
    importer(box.querySelector('#imp'));
  },

  recipe(box) {
    box.innerHTML = `<h2>Your first recipe ${doneBadge('recipe')}</h2>
      <p>A recipe lists the ingredients for one batch. Link each ingredient to your inventory and the studio works out what a batch costs from what you actually paid.</p>
      <div class="box aibox"><b>✨ Shortcut:</b> on the Recipes page choose <i>Capture recipe</i> and drop in a photo of a recipe card or paste the text — the AI fills it in for you to check.</div>
      ${st.done.recipe ? `<p>You have <b>${st.counts.recipes}</b> recipe${st.counts.recipes === 1 ? '' : 's'}. Nice.</p>` : '<p class="note">Come back here when you\'ve saved one — this step ticks itself off.</p>'}
      <div class="row" style="justify-content:flex-end"><a class="btn ${st.done.recipe ? 'ghost' : ''}" href="#/recipes">Go to Recipes</a>${st.done.recipe ? nextBtn('recipe') : ''}</div>`;
    wireNext(box);
  },

  batch(box) {
    box.innerHTML = `<h2>Make your first batch ${doneBadge('batch')}</h2>
      <p>Pick a recipe and how many times you're making it. The studio takes the ingredients out of stock, adds the finished products, gives the batch a number (like <b>B${today().slice(2).replace(/-/g, '')}-01</b>) and works out the cost per item.</p>
      <ul class="note"><li>Soaps that need to cure show at the top of <i>Batches</i> with a countdown.</li><li>Made a mistake? A batch can be undone as long as none of it has been sold.</li></ul>
      ${st.done.batch ? `<p>You've made <b>${st.counts.batches}</b> batch${st.counts.batches === 1 ? '' : 'es'}.</p>` : (st.done.recipe ? '<p class="note">This step ticks itself off once your first batch is saved.</p>' : '<p class="note">You\'ll need a recipe first.</p>')}
      <div class="row" style="justify-content:flex-end"><a class="btn ${st.done.batch ? 'ghost' : ''}" href="#/batches">Go to Batches</a>${st.done.batch ? nextBtn('batch') : ''}</div>`;
    wireNext(box);
  },

  sale(box) {
    box.innerHTML = `<h2>Record your first sale ${doneBadge('sale')}</h2>
      <p>Add the products you sold — prices fill in from each product, stock goes down, and the profit on the sale is worked out from what the batch cost you.</p>
      <p class="note">Add other money going out (courier, market fees, printing) under <i>Other expenses</i> on the <i>Financial</i> page so it shows your real profit.</p>
      ${st.done.sale ? `<p>You've recorded <b>${st.counts.sales}</b> sale line${st.counts.sales === 1 ? '' : 's'}.</p>` : '<p class="note">This step ticks itself off once your first sale is saved.</p>'}
      <div class="row" style="justify-content:flex-end"><a class="btn ${st.done.sale ? 'ghost' : ''}" href="#/sales">Go to Sales</a></div>`;
  }
};

// ---------- categories as removable chips ----------
async function chips(kind) {
  const box = $('#cc-' + kind); if (!box) return;
  const cats = (await api('/categories?kind=' + kind)).filter(c => c.active);
  box.innerHTML = cats.map(c => `<span class="chip" data-id="${c.id}">${esc(c.name)}<button title="Remove" aria-label="Remove ${esc(c.name)}">✕</button></span>`).join('')
    + `<span class="chipadd"><input placeholder="Add…" id="ca-${kind}"><button class="btn small" id="cb-${kind}">Add</button></span>`;
  box.querySelectorAll('.chip button').forEach(b => b.onclick = async () => {
    const r = await api('/categories/' + b.parentElement.dataset.id, { method: 'DELETE' }); toast(r.hidden ? 'In use, so it was hidden instead' : 'Removed'); chips(kind);
  });
  const add = async () => { const i = $('#ca-' + kind); if (!i.value.trim()) return; await api('/categories', { method: 'POST', body: { kind, name: i.value } }); chips(kind); setTimeout(() => $('#ca-' + kind)?.focus(), 50); };
  $('#cb-' + kind).onclick = add; $('#ca-' + kind).onkeydown = e => { if (e.key === 'Enter') add(); };
}

// ---------- spreadsheet import ----------
const FIELDS = {
  material: [['name', 'Item name', true], ['category', 'Category'], ['sku', 'Code / SKU'], ['unit', 'Unit (g, ml, each…)'], ['qty', 'Quantity on hand'], ['cost', 'Cost per unit (R)'], ['reorder', 'Reorder at']],
  product: [['name', 'Product name', true], ['category', 'Category'], ['sku', 'Code / SKU'], ['size', 'Size (e.g. 250ml)'], ['qty', 'Quantity on hand'], ['cost', 'Cost to make, each (R)'], ['price', 'Selling price (R)'], ['reorder', 'Reorder at']]
};
const SYN = {
  name: ['name', 'item', 'itemname', 'product', 'productname', 'description', 'material', 'ingredient', 'stockitem'],
  category: ['category', 'cat', 'type', 'group'],
  sku: ['sku', 'code', 'itemcode', 'productcode', 'barcode', 'ref'],
  unit: ['unit', 'units', 'uom', 'measure', 'unitofmeasure'],
  size: ['size', 'volume', 'packsize'],
  qty: ['qty', 'quantity', 'stock', 'onhand', 'qtyonhand', 'instock', 'soh', 'stockonhand', 'opening', 'openingstock', 'count', 'balance', 'amount'],
  cost: ['cost', 'unitcost', 'costprice', 'costperunit', 'costeach', 'buyprice', 'purchaseprice', 'costtomake'],
  price: ['price', 'sellingprice', 'sellprice', 'retail', 'retailprice', 'rrp', 'saleprice'],
  reorder: ['reorder', 'reorderlevel', 'reorderat', 'min', 'minimum', 'minstock']
};
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const imp = { kind: 'material', book: null, sheet: null, grid: null, head: 0, map: {}, preview: null, file: '' };

let xlsxP;
function loadXLSX() {
  return xlsxP ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error('Could not load the spreadsheet reader — check your internet and try again')); };
    document.head.appendChild(s);
  });
}

function guessMap(headers, kind) {
  const map = {}, used = new Set(), H = headers.map(norm);
  const syn = f => kind === 'material' && f === 'cost' ? [...SYN.cost, 'price', 'unitprice'] : SYN[f];
  for (const pass of ['exact', 'part']) for (const [f] of FIELDS[kind]) {
    if (map[f] !== undefined) continue;
    const i = H.findIndex((h, j) => h && !used.has(j) && syn(f).some(w => pass === 'exact' ? h === w : (w.length > 3 && h.includes(w))));
    if (i >= 0) { map[f] = i; used.add(i); }
  }
  return map;
}
function findHeader(grid) {
  let best = 0, score = -1;
  grid.slice(0, 15).forEach((row, i) => {
    const H = row.map(norm); const sc = Object.values(SYN).flat().filter(w => H.includes(w)).length + (H.some(h => SYN.name.includes(h)) ? 2 : 0);
    if (sc > score) { score = sc; best = i; }
  });
  return best;
}
function loadSheet() {
  const ws = imp.book.Sheets[imp.sheet];
  imp.grid = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
  imp.head = findHeader(imp.grid);
  imp.map = guessMap(imp.grid[imp.head] || [], imp.kind);
  imp.preview = null;
}
function rowsOut() {
  const m = imp.map, cell = (r, f) => m[f] === undefined ? '' : r[m[f]];
  return imp.grid.slice(imp.head + 1).filter(r => String(cell(r, 'name')).trim()).map(r => {
    const o = {}; for (const [f] of FIELDS[imp.kind]) o[f] = cell(r, f);
    // "500g" in the quantity column with no unit column → use the letters as the unit
    if (imp.kind === 'material' && m.unit === undefined && typeof o.qty === 'string') o.unit = o.qty.replace(/[\d.,\s]/g, '');
    return o;
  });
}
function template() {
  const csv = imp.kind === 'material'
    ? 'Name,Category,Code,Unit,Quantity on hand,Cost per unit,Reorder at\nArgan oil,Oil & Butter,,ml,500,0.85,100\nAmber 100ml bottle,Packaging,,each,40,6.50,10\n'
    : 'Name,Category,Code,Size,Quantity on hand,Cost to make,Selling price,Reorder at\nRose hair oil,Hair Oil,HO-ROSE,100ml,12,38.00,145.00,4\n';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = imp.kind === 'material' ? 'pretty-inventory-template.csv' : 'pretty-products-template.csv'; a.click();
}

function importer(box) {
  const K = imp.kind, headers = imp.grid ? imp.grid[imp.head] || [] : [];
  const colOpts = sel => `<option value="">— not in my sheet —</option>` + headers.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('');
  box.innerHTML = `<div class="imp">
    <div class="field"><label>What's in this sheet?</label><div class="seg">
      <button data-kind="material" class="${K === 'material' ? 'on' : ''}">Ingredients & supplies</button><button data-kind="product" class="${K === 'product' ? 'on' : ''}">Finished products</button></div></div>
    <label class="drop" id="impDrop"><input type="file" id="impFile" accept=".xlsx,.xls,.csv,.ods" hidden>${imp.file ? '📄 ' + esc(imp.file) + ' — <u>choose another file</u>' : 'Drop your spreadsheet here, or click to choose<div class="note" style="font-weight:400;margin-top:4px">Excel (.xlsx) or CSV</div>'}</label>
    <div class="note" style="margin-top:6px">No spreadsheet? <a href="#" id="impTpl">Download a template</a>, fill it in and drop it here.</div>
    ${imp.grid ? `
      ${imp.book.SheetNames.length > 1 ? `<div class="field" style="margin-top:14px"><label>Sheet</label><select id="impSheet">${imp.book.SheetNames.map(n => `<option ${n === imp.sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : ''}
      <h3 style="margin:16px 0 4px">Match your columns</h3><p class="note" style="margin:0 0 10px">We've guessed — check each one. Only the name is required.</p>
      <div class="grid2 mapg">${FIELDS[K].map(([f, label, req]) => `<div class="field"><label>${label}${req ? ' *' : ''}</label><select data-f="${f}">${colOpts(imp.map[f])}</select></div>`).join('')}</div>
      <div class="row" style="flex-wrap:wrap"><div class="field" style="margin:0"><label>Stock counted on</label><input type="date" id="impDate" value="${today()}" style="width:170px"></div>
        <span style="flex:1"></span><button class="btn ghost" id="impPrev">Check ${rowsOut().length} rows</button></div>
      <div id="impRes"></div>` : ''}
  </div>`;
  box.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { imp.kind = b.dataset.kind; if (imp.grid) imp.map = guessMap(imp.grid[imp.head] || [], imp.kind); imp.preview = null; importer(box); });
  box.querySelector('#impTpl').onclick = e => { e.preventDefault(); template(); };
  const drop = box.querySelector('#impDrop'), input = box.querySelector('#impFile');
  const take = async file => {
    if (!file) return;
    try {
      drop.innerHTML = '<span class="spin"></span>Reading ' + esc(file.name) + '…';
      const X = await loadXLSX();
      imp.book = X.read(await file.arrayBuffer(), { type: 'array' }); imp.sheet = imp.book.SheetNames[0]; imp.file = file.name;
      loadSheet(); importer(box);
    } catch (e) { toast(e.message || 'Could not read that file', true); imp.file = ''; importer(box); }
  };
  input.onchange = () => take(input.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); };
  if (!imp.grid) return;
  const sheetSel = box.querySelector('#impSheet'); if (sheetSel) sheetSel.onchange = () => { imp.sheet = sheetSel.value; loadSheet(); importer(box); };
  box.querySelectorAll('[data-f]').forEach(s => s.onchange = () => { imp.map[s.dataset.f] = s.value === '' ? undefined : Number(s.value); imp.preview = null; box.querySelector('#impRes').innerHTML = ''; box.querySelector('#impPrev').textContent = `Check ${rowsOut().length} rows`; });
  box.querySelector('#impPrev').onclick = async () => {
    if (imp.map.name === undefined) return toast('Choose which column has the name', true);
    const rows = rowsOut(); if (!rows.length) return toast('No rows with a name found', true);
    imp.preview = await api('/onboarding/import', { method: 'POST', body: { kind: imp.kind, rows, dry_run: true } });
    preview(box);
  };
  if (imp.preview) preview(box);
}

function preview(box) {
  const p = imp.preview, P = imp.kind === 'product', res = box.querySelector('#impRes');
  const shown = p.rows.slice(0, 60);
  res.innerHTML = `<div class="box" style="margin-top:14px"><b>${p.new} new ${P ? 'product' : 'item'}${p.new === 1 ? '' : 's'}</b> ready to import${p.skipped ? ` · ${p.skipped} skipped` : ''}${p.newCategories.length ? ` · new categor${p.newCategories.length === 1 ? 'y' : 'ies'}: ${p.newCategories.map(esc).join(', ')}` : ''}.</div>
    <div class="tscroll"><table class="tbl"><thead><tr><th>Name</th><th>Category</th><th>${P ? 'Size' : 'Unit'}</th><th class="r">On hand</th><th class="r">${P ? 'Cost' : 'Cost/unit'}</th>${P ? '<th class="r">Price</th>' : ''}</tr></thead><tbody>
    ${shown.map(r => `<tr class="${r.status === 'new' ? '' : 'skip'}"><td><b>${esc(r.name)}</b>${r.status !== 'new' ? ' <span class="pill red">skipped</span>' : ''}${r.notes.length ? `<div class="note warnt">${r.notes.map(esc).join(' · ')}</div>` : ''}</td>
      <td>${esc(r.category || '—')}${r.newCategory ? ' <span class="pill">new</span>' : ''}</td><td>${P ? (r.size ? qty(r.size, r.size_unit) : '—') : esc(r.unit || '')}</td>
      <td class="r">${qty(r.qty)}</td><td class="r">${r.cost ? money(r.cost) : '—'}</td>${P ? `<td class="r">${r.price ? money(r.price) : '—'}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>${p.rows.length > shown.length ? `<div class="note">…and ${p.rows.length - shown.length} more rows.</div>` : ''}
    <div class="row" style="justify-content:flex-end;margin-top:12px">${p.new ? `<button class="btn" id="impGo">Import ${p.new} ${P ? 'product' : 'item'}${p.new === 1 ? '' : 's'}</button>` : '<span class="note">Nothing new to import.</span>'}</div>`;
  const go = res.querySelector('#impGo'); if (!go) return;
  go.onclick = async () => {
    go.disabled = true; go.innerHTML = '<span class="spin"></span>Importing…';
    try {
      const r = await api('/onboarding/import', { method: 'POST', body: { kind: imp.kind, rows: rowsOut(), date: box.querySelector('#impDate').value } });
      toast(`Imported ${r.imported} ${P ? 'product' : 'item'}${r.imported === 1 ? '' : 's'}`);
      Object.assign(imp, { book: null, sheet: null, grid: null, preview: null, file: '', kind: P ? 'material' : 'product' });
      await refresh(); draw();
      $('#imp').insertAdjacentHTML('afterbegin', `<div class="box wdone"><b>✓ ${r.imported} ${P ? 'product' : 'item'}${r.imported === 1 ? '' : 's'} imported</b>${r.skipped ? ` (${r.skipped} skipped)` : ''}. ${P ? 'Got an ingredients sheet too?' : 'Got a finished-products sheet too?'} Drop it below — we've switched to ${P ? 'ingredients & supplies' : 'finished products'} for you.</div>`);
    } catch { go.disabled = false; go.textContent = 'Try again'; }
  };
}
