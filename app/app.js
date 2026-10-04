import { CHANGELOG } from './changelog.js';

const APP_VERSION = CHANGELOG[0].version, APP_DATE = CHANGELOG[0].date;
const PAGES = [
  { id: 'overview', label: 'Overview' },
  { id: 'inventory', label: 'Inventory', soon: true },
  { id: 'products', label: 'Finished products', soon: true },
  { id: 'purchases', label: 'Purchases', soon: true },
  { id: 'recipes', label: 'Recipes', soon: true },
  { id: 'batches', label: 'Make a batch', soon: true },
  { id: 'sales', label: 'Sales', soon: true },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help', soon: true }
];
const QUOTES = ['One good batch at a time — that is how a business grows.', 'Keep notes: your future self is your best apprentice.',
  'Measure twice, pour once, smile always.', 'Your craft is proof that gentle things can be strong.', 'Pretty is not doing less — it is doing it with attention.'];

const state = { me: null, page: 'overview' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { method: opts.method || 'GET', headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { toast('Your login has expired — refreshing…', true); setTimeout(() => location.reload(), 1500); throw new Error('login'); }
  if (!res.ok) { toast(data.error || 'Something went wrong', true); throw new Error(data.error); }
  return data;
}
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2800); }
function modal(html) { $('#modalCard').innerHTML = html; $('#modal').hidden = false; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.dataset.close !== undefined) $('#modal').hidden = true; });

function renderNav() {
  $('#nav').innerHTML = PAGES.map(p => `<a href="#/${p.id}" class="${p.id === state.page ? 'on' : ''}">${p.label}${p.soon ? '<span class="soon">soon</span>' : ''}</a>`).join('');
  $('#ver').textContent = `Version ${APP_VERSION} · ${new Date(APP_DATE).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  $('#copy').textContent = `© ${new Date().getFullYear()} ${state.me?.business?.name || 'Pretty'} Studio. All rights reserved.`;
}
$('#ver').addEventListener('click', () => modal(`<h2>What's new</h2><div class="cl">${CHANGELOG.map(c => `<h3>Version ${c.version} <span class="note">· ${c.date}</span></h3><ul>${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</div><div style="text-align:right;margin-top:18px"><button class="btn" data-close>Close</button></div>`));
$('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('open'));

// ---------- Pages ----------
const VIEWS = {
  overview() {
    const h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const name = state.me?.business?.ownerName;
    return `<div class="head"><div><h1>${greet}${name ? ', ' + esc(name) : ''}</h1>
      <div class="sub">${new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
      <div class="quote">“${QUOTES[new Date().getDate() % QUOTES.length]}”</div></div></div>
      <div class="tiles">${['Ingredients', 'Finished products', 'Batches', 'Low stock'].map(k => `<div class="tile"><div class="k">${k}</div><div class="v">—</div></div>`).join('')}</div>
      <div class="card"><h2>Getting started</h2><p class="note" style="margin:0">The studio is being built in stages. This version has <b>Settings</b> ready — set your business details and categories there. Inventory, products, purchases and recipes arrive in the next updates; click the version label (bottom left) to see what's new each time.</p></div>`;
  },
  settings() {
    return `<div class="head"><div><h1>Settings</h1><div class="sub">Your business details and the categories used across the studio.</div></div></div>
    <div class="card"><h2>Business details</h2>
      <div class="grid2">
        <div class="field"><label>Business name</label><input id="bName"></div>
        <div class="field"><label>Your name (for the greeting)</label><input id="bOwner"></div>
        <div class="field"><label>Phone</label><input id="bPhone"></div>
        <div class="field"><label>Email</label><input id="bEmail" type="email"></div>
      </div>
      <div class="field"><label>Address</label><textarea id="bAddr" rows="2"></textarea></div>
      <div style="text-align:right"><button class="btn" id="bSave">Save details</button></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Product categories</h2><p class="note" style="margin-top:-6px">What you sell — e.g. Hair Oil, Shampoo, Perfume.</p><div id="cat-product"></div></div>
      <div class="card"><h2>Material categories</h2><p class="note" style="margin-top:-6px">What you buy — ingredients, packaging, labels…</p><div id="cat-material"></div></div>
    </div>
    <div class="card"><h2>Account</h2><p class="note" style="margin:0">Signed in as <b>${esc(state.me?.email)}</b>. ${state.me?.strictLogin ? 'Full login check is on.' : 'Login is checked at the front door (full check gets switched on during setup).'}</p></div>`;
  },
  soon(p) {
    return `<div class="head"><div><h1>${p.label}</h1></div></div><div class="card soonbox"><div class="badge">Coming in the next update</div>
      <p class="note">This page is part of version 1.0 and is being built now. You'll see it appear here automatically when it's ready.</p></div>`;
  }
};

const AFTER = {
  async settings() {
    const b = state.me.business || {};
    $('#bName').value = b.name || 'Pretty'; $('#bOwner').value = b.ownerName || ''; $('#bPhone').value = b.phone || ''; $('#bEmail').value = b.email || ''; $('#bAddr').value = b.address || '';
    $('#bSave').onclick = async () => {
      state.me.business = await api('/settings/business', { method: 'PUT', body: { name: $('#bName').value, ownerName: $('#bOwner').value, phone: $('#bPhone').value, email: $('#bEmail').value, address: $('#bAddr').value } });
      renderNav(); toast('Details saved');
    };
    await Promise.all(['product', 'material'].map(renderCats));
  }
};

async function renderCats(kind) {
  const box = $('#cat-' + kind); if (!box) return;
  const cats = await api('/categories?kind=' + kind);
  box.innerHTML = `<div class="list">${cats.map((c, i) => `
    <div class="li ${c.active ? '' : 'off'}" data-id="${c.id}">
      <span class="name">${esc(c.name)}${c.active ? '' : ' <span class="note">(hidden)</span>'}</span>
      <button class="icon-btn" data-act="up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-btn" data-act="down" title="Move down" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="icon-btn" data-act="rename" title="Rename">✎</button>
      <button class="icon-btn" data-act="${c.active ? 'hide' : 'show'}" title="${c.active ? 'Hide' : 'Show again'}">${c.active ? '◌' : '↺'}</button>
      <button class="icon-btn" data-act="del" title="Delete">✕</button>
    </div>`).join('') || '<div class="empty">No categories yet.</div>'}</div>
    <div class="row" style="margin-top:12px"><input placeholder="New category name" id="new-${kind}"><button class="btn small" id="add-${kind}">Add</button></div>`;
  const add = async () => {
    const inp = $('#new-' + kind); if (!inp.value.trim()) return;
    await api('/categories', { method: 'POST', body: { kind, name: inp.value } }); toast('Category added'); renderCats(kind);
  };
  $('#add-' + kind).onclick = add; $('#new-' + kind).onkeydown = e => { if (e.key === 'Enter') add(); };
  box.querySelectorAll('.li').forEach(li => li.addEventListener('click', async e => {
    const act = e.target.dataset.act; if (!act) return;
    const id = li.dataset.id, idx = cats.findIndex(c => c.id === id), c = cats[idx];
    if (act === 'rename') {
      li.querySelector('.name').innerHTML = `<input value="${esc(c.name)}">`;
      const inp = li.querySelector('input'); inp.focus(); inp.select();
      const save = async () => { if (inp.value.trim() && inp.value.trim() !== c.name) { await api('/categories/' + id, { method: 'PUT', body: { name: inp.value } }); toast('Renamed'); } renderCats(kind); };
      inp.onkeydown = ev => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') renderCats(kind); }; inp.onblur = save;
    }
    if (act === 'hide' || act === 'show') { await api('/categories/' + id, { method: 'PUT', body: { active: act === 'show' } }); renderCats(kind); }
    if (act === 'up' || act === 'down') {
      const other = cats[idx + (act === 'up' ? -1 : 1)]; if (!other) return;
      const order = cats.map(x => x.id); [order[idx], order[order.indexOf(other.id)]] = [other.id, c.id];
      await Promise.all(order.map((oid, i) => api('/categories/' + oid, { method: 'PUT', body: { sort: i + 1 } })));
      renderCats(kind);
    }
    if (act === 'del') {
      if (!confirmInline(li, `Delete “${c.name}”?`, async () => { const r = await api('/categories/' + id, { method: 'DELETE' }); toast(r.hidden ? r.message : 'Category deleted'); renderCats(kind); })) return;
    }
  }));
}
function confirmInline(li, text, onYes) {
  li.innerHTML = `<span class="name">${esc(text)}</span><button class="btn small danger">Yes, delete</button><button class="btn small ghost">Cancel</button>`;
  const [yes, no] = li.querySelectorAll('button');
  yes.onclick = ev => { ev.stopPropagation(); onYes(); };
  no.onclick = ev => { ev.stopPropagation(); renderCats(li.closest('[id^=cat-]').id.slice(4)); };
  return false;
}

async function route() {
  const id = (location.hash.replace('#/', '') || 'overview').split('?')[0];
  const p = PAGES.find(x => x.id === id) || PAGES[0];
  state.page = p.id; renderNav(); $('#side').classList.remove('open');
  $('#page').innerHTML = p.soon ? VIEWS.soon(p) : VIEWS[p.id]();
  if (AFTER[p.id]) await AFTER[p.id]();
  window.scrollTo(0, 0);
}

(async function start() {
  try { state.me = await api('/me'); } catch { state.me = { business: {} }; }
  window.addEventListener('hashchange', route);
  route();
})();
