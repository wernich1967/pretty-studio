import { api, toast, esc, qty, today, $ } from '../core.js';

export function render() {
  return `<div class="head"><div><h1>Curing</h1><div class="sub">Batches that need time before they're ready to sell.</div></div></div>
    <div class="card"><h2>Curing now</h2><div id="now"><div class="empty">Loading…</div></div></div>
    <div class="card"><h2>Recently ready</h2><div id="done"></div></div>`;
}
export async function after() {
  const rows = await api('/batches'), t = today();
  const days = d => Math.ceil((new Date(d) - new Date(t)) / 864e5);
  const curing = rows.filter(b => b.ready_date && b.status === 'curing' && b.ready_date > t).sort((a, b) => a.ready_date.localeCompare(b.ready_date));
  const ready = rows.filter(b => b.ready_date && (b.status !== 'curing' || b.ready_date <= t) && b.ready_date >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  $('#now').innerHTML = curing.length ? curing.map(b => {
    const total = Math.max(1, days(b.ready_date) + Math.round((new Date(t) - new Date(b.date)) / 864e5)), left = days(b.ready_date), pct = Math.round((1 - left / total) * 100);
    return `<div class="cure"><div class="row" style="justify-content:space-between"><div><b>${esc(b.batch_no)}</b>${b.recipe ? ' · ' + esc(b.recipe) : ''} <span class="note">→ ${esc(b.product || '')}${b.qty_made ? ' · ' + qty(b.qty_made) + ' made' : ''}</span></div>
      <div class="row"><span class="pill">${left} day${left === 1 ? '' : 's'} to go</span><button class="btn small ghost" data-id="${b.id}">Ready now</button></div></div>
      <div class="prog"><div style="width:${pct}%"></div></div><div class="note">Made ${esc(b.date)} · ready ${esc(b.ready_date)}</div></div>`;
  }).join('') : '<div class="empty">Nothing curing. When you make a batch, set “Ready to sell from” and it shows up here.</div>';
  $('#done').innerHTML = ready.length ? `<div class="list">${ready.map(b => `<div class="li"><span class="name"><b>${esc(b.batch_no)}</b>${b.recipe ? ' · ' + esc(b.recipe) : ''}${b.product ? ' <span class="note">→ ' + esc(b.product) + '</span>' : ''}</span><span class="note">ready ${esc(b.ready_date)}</span></div>`).join('')}</div>` : '<div class="empty">No batches became ready in the last 30 days.</div>';
  $('#now').querySelectorAll('[data-id]').forEach(btn => btn.onclick = async () => { await api(`/batches/${btn.dataset.id}/ready`, { method: 'POST' }); toast('Marked as ready'); after(); });
}

// Used on the Batches page: a "Curing now" card that only appears while something is curing.
export async function curingCard(el, rows, onChange) {
  const t = today(), days = d => Math.ceil((new Date(d) - new Date(t)) / 864e5);
  const curing = rows.filter(b => b.ready_date && b.status === 'curing' && b.ready_date > t).sort((a, b) => a.ready_date.localeCompare(b.ready_date));
  if (!curing.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card"><h2>Curing now <span class="pill">${curing.length}</span></h2>${curing.map(b => {
    const total = Math.max(1, days(b.ready_date) + Math.round((new Date(t) - new Date(b.date)) / 864e5)), left = days(b.ready_date), pct = Math.round((1 - left / total) * 100);
    return `<div class="cure"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><div><b>${esc(b.batch_no)}</b>${b.recipe ? ' · ' + esc(b.recipe) : ''} <span class="note">→ ${esc(b.product || '')}${b.qty_made ? ' · ' + qty(b.qty_made) + ' made' : ''}</span></div>
      <div class="row"><span class="pill">${left} day${left === 1 ? '' : 's'} to go</span><button class="btn small ghost" data-ready="${b.id}">Ready now</button></div></div>
      <div class="prog"><div style="width:${pct}%"></div></div><div class="note">Made ${esc(b.date)} · ready ${esc(b.ready_date)}</div></div>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-ready]').forEach(btn => btn.onclick = async () => { await api(`/batches/${btn.dataset.ready}/ready`, { method: 'POST' }); toast('Marked as ready'); onChange?.(); });
}
