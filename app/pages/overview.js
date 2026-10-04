import { api, esc, state, money, qty, REASONS, $ } from '../core.js';
const QUOTES = ['One good batch at a time — that is how a business grows.', 'Keep notes: your future self is your best apprentice.',
  'Measure twice, pour once, smile always.', 'Your craft is proof that gentle things can be strong.', 'Pretty is not doing less — it is doing it with attention.'];

export function render() {
  const h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = state.me?.business?.ownerName;
  return `<div class="head"><div><h1>${greet}${name ? ', ' + esc(name) : ''}</h1>
    <div class="sub">${new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
    <div class="quote">“${QUOTES[new Date().getDate() % QUOTES.length]}”</div></div></div>
    <div class="tiles" id="tiles"><div class="tile"><div class="k">Loading</div><div class="v">…</div></div></div>
    <div class="grid2"><div class="card"><h2>Recent stock changes</h2><div id="recent"></div></div>
    <div class="card"><h2>Quick links</h2><div class="list">
      <a class="li qlink" href="#/inventory"><span class="name">Inventory — ingredients & supplies</span>›</a>
      <a class="li qlink" href="#/products"><span class="name">Finished products</span>›</a>
      <a class="li qlink" href="#/sales"><span class="name">Record a sale</span>›</a>
      <a class="li qlink" href="#/financial"><span class="name">Financial — money in, money out, profit</span>›</a>
      <a class="li qlink" href="#/settings"><span class="name">Settings — categories & business details</span>›</a>
      <a class="li qlink" href="#/maintenance"><span class="name">Maintenance — backup & test data</span>›</a></div></div></div>`;
}
export async function after() {
  const d = await api('/dashboard');
  $('#tiles').innerHTML = [['Sales this month', money(d.salesMonth)], ['Inventory items', d.materials], ['Finished products', d.products], ['Low stock', d.lowStock], ['Curing', d.curing], ['Stock value', money(d.stockValue)]]
    .map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v" ${k === 'Low stock' && v ? 'style="color:var(--rose)"' : ''}>${v}</div></div>`).join('');
  $('#recent').innerHTML = d.recent.length ? `<div class="list">${d.recent.map(m => `<div class="li"><span class="note" style="width:84px">${esc(m.date)}</span><span class="name">${esc(m.name)} <span class="note">· ${REASONS[m.reason] || m.reason}</span></span><b style="color:${m.qty < 0 ? 'var(--rose)' : 'var(--ok)'}">${m.qty > 0 ? '+' : ''}${qty(m.qty, m.unit)}</b></div>`).join('')}</div>` : '<div class="empty">Nothing yet — add stock in Inventory.</div>';
}
