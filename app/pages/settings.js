import { api, toast, esc, state, $, clearCatCache } from '../core.js';

export function render() {
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
  <div class="card"><h2>✨ AI invoice reading</h2><div id="aiSet"><div class="empty">Loading…</div></div></div>
  <div class="card"><h2>Account</h2><p class="note" style="margin:0">Signed in as <b>${esc(state.me?.email)}</b>. ${state.me?.strictLogin ? 'Full login check is on.' : 'Login is checked at the front door.'}</p></div>`;
}

export async function after(ctx) {
  const b = state.me.business || {};
  $('#bName').value = b.name || 'Pretty'; $('#bOwner').value = b.ownerName || ''; $('#bPhone').value = b.phone || ''; $('#bEmail').value = b.email || ''; $('#bAddr').value = b.address || '';
  $('#bSave').onclick = async () => {
    state.me.business = await api('/settings/business', { method: 'PUT', body: { name: $('#bName').value, ownerName: $('#bOwner').value, phone: $('#bPhone').value, email: $('#bEmail').value, address: $('#bAddr').value } });
    ctx.renderNav(); toast('Details saved');
  };
  aiSettings();
  await Promise.all(['product', 'material'].map(renderCats));
}

async function renderCats(kind) {
  const box = $('#cat-' + kind); if (!box) return;
  clearCatCache();
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
      let done = false;
      const save = async () => { if (done) return; done = true; if (inp.value.trim() && inp.value.trim() !== c.name) { await api('/categories/' + id, { method: 'PUT', body: { name: inp.value } }); toast('Renamed'); } renderCats(kind); };
      inp.onkeydown = ev => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') { done = true; renderCats(kind); } }; inp.onblur = save;
    }
    if (act === 'hide' || act === 'show') { await api('/categories/' + id, { method: 'PUT', body: { active: act === 'show' } }); renderCats(kind); }
    if (act === 'up' || act === 'down') {
      const j = idx + (act === 'up' ? -1 : 1); if (!cats[j]) return;
      const order = cats.map(x => x.id); [order[idx], order[j]] = [order[j], order[idx]];
      await Promise.all(order.map((oid, i) => api('/categories/' + oid, { method: 'PUT', body: { sort: i + 1 } })));
      renderCats(kind);
    }
    if (act === 'del') {
      li.innerHTML = `<span class="name">Delete “${esc(c.name)}”?</span><button class="btn small danger">Yes, delete</button><button class="btn small ghost">Cancel</button>`;
      const [yes, no] = li.querySelectorAll('button');
      yes.onclick = async ev => { ev.stopPropagation(); const r = await api('/categories/' + id, { method: 'DELETE' }); toast(r.hidden ? r.message : 'Category deleted'); renderCats(kind); };
      no.onclick = ev => { ev.stopPropagation(); renderCats(kind); };
    }
  }));
}

async function aiSettings() {
  const a = await api('/ai/settings');
  $('#aiSet').innerHTML = `<div class="row" style="flex-wrap:wrap"><label style="margin:0">Model</label>
    <select id="aiModel" style="max-width:320px">${Object.entries(a.models).map(([k, v]) => `<option value="${k}" ${k === a.model ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <p class="note" style="margin-bottom:0">Sonnet reads messy photos and long invoices more reliably; Haiku costs about half and is fine for clear printed invoices. ${a.ready ? '' : '<b>AI is not switched on yet</b> — the API key still needs to be added in Cloudflare.'}</p>`;
  $('#aiModel').onchange = async e => { await api('/ai/settings', { method: 'PUT', body: { model: e.target.value } }); toast('AI model saved'); };
}
