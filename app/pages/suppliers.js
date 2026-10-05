// Suppliers — who you buy from, how often and how much.
import { api, toast, modal, closeModal, esc, money, $ } from '../core.js';

export function render() {
  return `<div class="head"><div><h1>Suppliers</h1><div class="sub">Who you buy from — contact details, how often you've bought and what you've spent.</div></div>
    <button class="btn" id="addSup">+ Add supplier</button></div>
    <div class="card"><input id="sq" placeholder="Search suppliers…" style="margin-bottom:14px"><div id="table"><div class="empty">Loading…</div></div></div>`;
}

export async function after() {
  const rows = await api('/suppliers');
  const draw = q => {
    const list = rows.filter(r => !q || (r.name + ' ' + (r.contact || '') + ' ' + (r.email || '')).toLowerCase().includes(q));
    $('#table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Supplier</th><th>Contact</th><th class="r">Purchases</th><th class="r">Spent</th><th>Last bought</th></tr></thead><tbody>
      ${list.map(r => `<tr data-id="${r.id}"><td><b>${esc(r.name)}</b>${r.source === 'test' ? ' <span class="pill">test</span>' : ''}</td>
        <td>${esc(r.contact || '')}${r.phone ? `<div class="note">${esc(r.phone)}</div>` : ''}${r.email ? `<div class="note">${esc(r.email)}</div>` : ''}${!r.contact && !r.phone && !r.email ? '<span class="note">—</span>' : ''}</td>
        <td class="r">${r.purchases}</td><td class="r">${money(r.spent)}</td><td>${esc(r.last || '—')}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${rows.length ? 'No supplier matches your search.' : 'No suppliers yet — add one here, or they are added automatically when you record a purchase.'}</div>`;
    $('#table').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => form(rows.find(r => r.id === tr.dataset.id)));
  };
  $('#sq').oninput = e => draw(e.target.value.toLowerCase());
  $('#addSup').onclick = () => form(null);
  draw('');
  if (/new=1/.test(location.hash)) { history.replaceState(null, '', '#/suppliers'); form(null); }
}

function form(s) {
  const it = s || {};
  const card = modal(`<h2>${s ? 'Edit supplier' : 'Add supplier'}</h2>
    <div class="field"><label>Name</label><input id="s_name" value="${esc(it.name)}"></div>
    <div class="grid2"><div class="field"><label>Contact person</label><input id="s_contact" value="${esc(it.contact)}"></div>
      <div class="field"><label>Phone</label><input id="s_phone" value="${esc(it.phone)}"></div></div>
    <div class="field"><label>Email</label><input id="s_email" type="email" value="${esc(it.email)}"></div>
    <div class="field"><label>Notes</label><textarea id="s_notes" rows="2" placeholder="e.g. account number, delivery days, minimum order">${esc(it.notes)}</textarea></div>
    ${s ? `<div class="box note">${it.purchases} purchase${it.purchases === 1 ? '' : 's'} · ${money(it.spent)} spent${it.last ? ' · last on ' + esc(it.last) : ''} — <a href="#/purchases">see Purchases</a></div>` : ''}
    <div class="row" style="justify-content:space-between">${s ? '<button class="btn danger small" id="s_del">Delete</button>' : '<span></span>'}
      <div class="row"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="s_save">${s ? 'Save changes' : 'Add supplier'}</button></div></div>`);
  card.querySelector('#s_save').onclick = async () => {
    const b = {}; ['name', 'contact', 'phone', 'email', 'notes'].forEach(k => b[k] = card.querySelector('#s_' + k).value);
    if (s) await api('/suppliers/' + s.id, { method: 'PUT', body: b }); else await api('/suppliers', { method: 'POST', body: b });
    closeModal(); toast(s ? 'Saved' : 'Supplier added'); after();
  };
  const del = card.querySelector('#s_del');
  if (del) del.onclick = () => {
    if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Click again to confirm'; return; }
    api('/suppliers/' + s.id, { method: 'DELETE' }).then(r => { closeModal(); toast(r.hidden ? r.message : 'Supplier deleted'); after(); });
  };
  card.querySelector('#s_name').focus();
}
