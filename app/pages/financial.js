import { api, toast, modal, closeModal, esc, money, today, $ } from '../core.js';

const IN = '#2c6fa8', OUT = '#c97a2b'; // validated pair (colour-blind safe)
const PERIODS = { month: 'This month', last: 'Last month', year: 'This year', all: 'All time' };
let period = 'month';
function range(p) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth(), f = x => x.toISOString().slice(0, 10);
  if (p === 'month') return [f(new Date(Date.UTC(y, m, 1))), today()];
  if (p === 'last') return [f(new Date(Date.UTC(y, m - 1, 1))), f(new Date(Date.UTC(y, m, 0)))];
  if (p === 'year') return [`${y}-01-01`, today()];
  return ['0000-01-01', '9999-12-31'];
}

export function render() {
  return `<div class="head"><div><h1>Financial</h1><div class="sub">Money in, money out, and what you actually made.</div></div>
    <div class="row"><select id="per" style="width:150px">${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${k === period ? 'selected' : ''}>${v}</option>`).join('')}</select><button class="btn ghost" id="addE">+ Other expense</button></div></div>
    <div class="tiles" id="tiles"></div>
    <div class="card"><h2>Money in vs money out — by month</h2><div id="chart"></div></div>
    <div class="grid2"><div class="card"><h2>Best products by profit</h2><div id="top"></div></div><div class="card"><h2>Other expenses</h2><div id="exp"></div></div></div>
    <p class="note">Money in = sales. Money out = stock purchases + other expenses. Profit = sales − cost of the products sold − other expenses.</p>`;
}

export async function after() {
  const [from, to] = range(period);
  const [d, exps] = await Promise.all([api(`/financial?from=${from}&to=${to}`), api('/expenses')]);
  $('#tiles').innerHTML = [['Money in (sales)', money(d.revenue)], ['Money out', money(d.purchases + d.expenses)], ['Cash left', money(d.cash)], ['Profit', money(d.profit)]]
    .map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('') +
    `<div class="tile"><div class="k">Gross margin</div><div class="v">${d.revenue ? Math.round(d.gross / d.revenue * 100) + '%' : '—'}</div></div>`;
  // grouped bars: in vs out per month
  const ms = [];
  if (d.months.length) { // fill empty months so gaps show
    let [y, m] = d.months[0].m.split('-').map(Number); const end = d.months[d.months.length - 1].m;
    for (let i = 0; i < 24; i++) { const k = `${y}-${String(m).padStart(2, '0')}`; ms.push(d.months.find(x => x.m === k) || { m: k, rev: 0, cogs: 0, spend: 0 }); if (k === end) break; if (++m > 12) { m = 1; y++; } }
  }
  const max = Math.max(1, ...ms.map(x => Math.max(x.rev, x.spend)));
  $('#chart').innerHTML = ms.length ? `<div class="legend"><span><i style="background:${IN}"></i>Money in</span><span><i style="background:${OUT}"></i>Money out</span></div>
    <div class="bars">${ms.map(x => `<div class="bgroup"><div class="bpair">
        <div class="bar" style="height:${x.rev / max * 100}%;background:${IN}" data-tip="${esc(x.m)} · in ${money(x.rev)}"></div>
        <div class="bar" style="height:${x.spend / max * 100}%;background:${OUT}" data-tip="${esc(x.m)} · out ${money(x.spend)}"></div></div>
      <div class="blabel">${new Date(x.m + '-01').toLocaleDateString('en-ZA', { month: 'short' })}</div></div>`).join('')}</div>
    <details style="margin-top:10px"><summary class="note">Show as table</summary><table class="tbl"><thead><tr><th>Month</th><th class="r">In</th><th class="r">Out</th><th class="r">Difference</th></tr></thead><tbody>
      ${ms.map(x => `<tr><td>${esc(x.m)}</td><td class="r">${money(x.rev)}</td><td class="r">${money(x.spend)}</td><td class="r">${money(x.rev - x.spend)}</td></tr>`).join('')}</tbody></table></details>`
    : '<div class="empty">No sales or purchases yet.</div>';
  const tip = $('#tip') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'tip', className: 'tip', hidden: true });
  $('#chart').querySelectorAll('.bar').forEach(b => {
    b.onmouseenter = () => { tip.textContent = b.dataset.tip; tip.hidden = false; };
    b.onmousemove = e => { tip.style.left = e.clientX + 12 + 'px'; tip.style.top = e.clientY - 30 + 'px'; };
    b.onmouseleave = () => tip.hidden = true;
  });
  $('#top').innerHTML = d.top.length ? `<table class="tbl"><thead><tr><th>Product</th><th class="r">Sold</th><th class="r">Sales</th><th class="r">Profit</th></tr></thead><tbody>
    ${d.top.map(t => `<tr><td>${esc(t.name)}</td><td class="r">${t.units}</td><td class="r">${money(t.rev)}</td><td class="r">${money(t.profit)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No sales in this period.</div>';
  const inP = exps.filter(e => e.date >= from && e.date <= to);
  $('#exp').innerHTML = inP.length ? `<div class="list">${inP.map(e => `<div class="li"><span class="note" style="width:84px">${esc(e.date)}</span><span class="name">${esc(e.category)}${e.description ? ' <span class="note">· ' + esc(e.description) + '</span>' : ''}</span><b>${money(e.amount)}</b><button class="icon-btn" data-id="${e.id}" title="Delete">✕</button></div>`).join('')}</div>` : '<div class="empty">No other expenses in this period.</div>';
  $('#exp').querySelectorAll('[data-id]').forEach(b => b.onclick = async () => { await api('/expenses/' + b.dataset.id, { method: 'DELETE' }); toast('Expense removed'); after(); });
  $('#per').onchange = e => { period = e.target.value; after(); };
  $('#addE').onclick = () => {
    const card = modal(`<h2>Other expense</h2><p class="note">Money spent that isn't stock — courier, market stall, website, labels printing…</p>
      <div class="grid2"><div class="field"><label>Date</label><input id="ed" type="date" value="${today()}"></div><div class="field"><label>Amount (R)</label><input id="ea" type="number" step="any"></div>
      <div class="field"><label>Category</label><input id="ec" list="ecs" placeholder="e.g. Courier"><datalist id="ecs"><option>Courier</option><option>Market fees</option><option>Website & online</option><option>Advertising</option><option>Printing</option><option>Transport</option><option>Other</option></datalist></div>
      <div class="field"><label>Description</label><input id="eds"></div></div>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="es">Save</button></div>`);
    card.querySelector('#es').onclick = async () => { await api('/expenses', { method: 'POST', body: { date: $('#ed').value, amount: $('#ea').value, category: $('#ec').value, description: $('#eds').value } }); closeModal(); toast('Expense saved'); after(); };
  };
}
