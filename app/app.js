import { CHANGELOG } from './changelog.js';
import { state, $, esc, api, modal } from './core.js';
import * as overview from './pages/overview.js';
import * as stock from './pages/stock.js';
import * as settings from './pages/settings.js';
import * as maintenance from './pages/maintenance.js';
import * as purchases from './pages/purchases.js';
import * as recipes from './pages/recipes.js';
import * as batches from './pages/batches.js';
import * as videos from './pages/videos.js';
import * as sales from './pages/sales.js';
import * as financial from './pages/financial.js';
import * as curing from './pages/curing.js';
import * as calculators from './pages/calculators.js';
import * as setup from './pages/setup.js';
import * as suppliers from './pages/suppliers.js';

const APP_VERSION = CHANGELOG[0].version, APP_DATE = CHANGELOG[0].date;
// Menu: grouped along the flow — buy → make → sell — then stock, money and tools. Settings & admin as footer links.
const PAGES = [
  { id: 'overview', label: 'Overview', mod: overview },
  { id: 'setup', label: 'Getting started', mod: setup },
  { id: 'purchases', label: 'Purchases', group: 'Buy', mod: purchases },
  { id: 'suppliers', label: 'Suppliers', group: 'Buy', mod: suppliers },
  { id: 'recipes', label: 'Recipes', group: 'Make', mod: recipes },
  { id: 'batches', label: 'Batches', group: 'Make', mod: batches },
  { id: 'curing', label: 'Curing', hidden: true, mod: curing },            // old link — now part of Batches
  { id: 'sales', label: 'Sales', group: 'Sell', mod: sales },
  { id: 'inventory', label: 'Ingredients & supplies', group: 'Stock', mod: stock },
  { id: 'products', label: 'Finished products', group: 'Stock', mod: stock },
  { id: 'financial', label: 'Financial', group: 'Money', mod: financial },
  { id: 'calculators', label: 'Calculators', group: 'Tools', mod: calculators },
  { id: 'videos', label: 'Videos', group: 'Tools', mod: videos },
  { id: 'settings', label: 'Settings', foot: true, mod: settings },
  { id: 'maintenance', label: 'Maintenance', foot: true, admin: true, mod: maintenance },
  { id: 'help', label: 'Help', foot: true, soon: true }
];

// "+ New" — the everyday jobs, one click from anywhere. `click` is the button the page itself uses.
const QUICK = [
  { label: 'Record a purchase', icon: '🧾', page: 'purchases', click: '#addP' },
  { label: 'Capture an invoice', icon: '✨', page: 'purchases', click: '#aiBtn', note: 'Photo or PDF — the AI fills it in' },
  { label: 'Make a batch', icon: '🧪', page: 'batches', click: '#addB' },
  { label: 'Record a sale', icon: '🛍️', page: 'sales', click: '#addS' },
  { label: 'Add an expense', icon: '💸', page: 'financial', click: '#addE', note: 'Courier, market fees, printing…' },
  { label: 'Add a recipe', icon: '📖', page: 'recipes', click: '#addR' },
  { label: 'Add an ingredient or supply', icon: '🫙', page: 'inventory', click: '#addItem' }
];
let pendingClick = null;
function quickMenu(anchor) {
  const open = $('#quick');
  if (!open.hidden) return closeQuick();
  open.innerHTML = `<div class="qhead">Add something new</div>${QUICK.map((q, i) => `<button data-i="${i}"><span class="qi">${q.icon}</span><span><b>${q.label}</b>${q.note ? `<span class="note">${q.note}</span>` : ''}</span></button>`).join('')}`;
  open.hidden = false; $('#quickShade').hidden = false;
  const mobile = window.innerWidth <= 820;
  open.classList.toggle('sheet', mobile);
  if (!mobile) { const r = anchor.getBoundingClientRect(); open.style.left = r.left + 'px'; open.style.top = r.bottom + 6 + 'px'; }
  else { open.style.left = ''; open.style.top = ''; }
  open.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    const q = QUICK[b.dataset.i]; closeQuick();
    pendingClick = q.click;
    if (state.page === q.page) clickPending(); else location.hash = '#/' + q.page;
  });
}
function closeQuick() { $('#quick').hidden = true; $('#quickShade').hidden = true; }
async function clickPending() {
  const sel = pendingClick; pendingClick = null; if (!sel) return;
  for (let t = 0; t < 30; t++) { const b = document.querySelector(sel); if (b) return b.click(); await new Promise(r => setTimeout(r, 100)); }
}

// While setup is in progress "Getting started" sits under Overview with a progress badge; afterwards it moves to the Studio group.
function navPages() {
  const o = state.onb, active = o && !o.hidden && !o.complete, list = PAGES.filter(p => p.id !== 'setup' && !p.hidden && (!p.admin || state.me?.admin)), s = PAGES.find(p => p.id === 'setup');
  if (active) list.splice(1, 0, s); else list.push({ ...s, label: 'Guide', foot: true });
  return list;
}
// Little counts next to menu items: low stock, batches curing, setup progress.
function badge(p) {
  const o = state.onb, c = state.counts || {};
  if (p.id === 'setup' && o && !o.hidden && !o.complete) return `<span class="nb">${o.doneCount}/${o.total}</span>`;
  if (p.id === 'inventory' && c.lowStock) return `<span class="nb warn" title="${c.lowStock} item(s) low on stock">${c.lowStock}</span>`;
  if (p.id === 'batches' && c.curing) return `<span class="nb" title="Curing">${c.curing} curing</span>`;
  return p.soon ? '<span class="soon">soon</span>' : '';
}
function renderNav() {
  let last = null;
  const all = navPages();
  // Settings, Maintenance, Help (and the guide once finished) sit as small links at the bottom so the menu fits without scrolling.
  $('#footNav').innerHTML = all.filter(p => p.foot).map(p => `<a href="#/${p.id}" class="${p.id === state.page ? 'on' : ''}">${p.label}</a>`).join('<span>·</span>');
  $('#nav').innerHTML = all.filter(p => !p.foot).map(p => {
    const head = p.group && p.group !== last ? `<div class="ngroup">${p.group}</div>` : '';
    last = p.group || null;
    return `${head}<a href="#/${p.id}" class="${p.id === state.page ? 'on' : ''}">${p.label}${badge(p)}</a>`;
  }).join('');
  $('#ver').textContent = `Version ${APP_VERSION} · ${new Date(APP_DATE).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  $('#copy').textContent = `© ${new Date().getFullYear()} ${state.me?.business?.name || 'Pretty'} Studio. All rights reserved.`;
}
async function refreshCounts() {
  try { const d = await api('/dashboard'); state.counts = { lowStock: d.lowStock, curing: d.curing }; renderNav(); } catch {}
}
['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => { if (!e.target.closest?.('.drop')) e.preventDefault(); })); // a missed drop must not navigate away
window.addEventListener('unhandledrejection', e => e.preventDefault()); // errors are already shown as a message
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.dataset.close !== undefined) $('#modal').hidden = true; });
$('#ver').addEventListener('click', () => modal(`<h2>What's new</h2><div class="cl">${CHANGELOG.map(c => `<h3>Version ${c.version} <span class="note">· ${c.date}</span></h3><ul>${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</div><div style="text-align:right;margin-top:18px"><button class="btn" data-close>Close</button></div>`));
$('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('open'));
$('#newBtn').addEventListener('click', e => quickMenu(e.currentTarget));
$('#bbNew').addEventListener('click', e => quickMenu(e.currentTarget));
$('#bbMenu').addEventListener('click', () => $('#side').classList.toggle('open'));
$('#quickShade').addEventListener('click', () => { closeQuick(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeQuick(); });

const soon = p => `<div class="head"><div><h1>${p.label}</h1></div></div><div class="card soonbox"><div class="badge">Coming in the next update</div>
  <p class="note">This page is part of version 1.0 and is being built now. You'll see it appear here automatically when it's ready.</p></div>`;

async function route() {
  const id = (location.hash.replace('#/', '') || 'overview').split('?')[0];
  const p = PAGES.find(x => x.id === id) || PAGES[0];
  if (p.id === 'curing') { location.replace('#/batches'); return; }
  if (p.admin && !state.me?.admin) { location.replace('#/overview'); return; }
  closeQuick();
  state.page = p.id; renderNav(); refreshCounts();
  document.querySelectorAll('#bbar [data-p]').forEach(a => a.classList.toggle('on', a.dataset.p === p.id)); $('#side').classList.remove('open'); $('#modal').hidden = true;
  $('#page').innerHTML = p.soon ? soon(p) : p.mod.render(p.id);
  window.scrollTo(0, 0);
  if (p.mod?.after) { try { await p.mod.after(['settings', 'setup'].includes(p.id) ? { renderNav } : p.id); } catch (e) { console.error(e); } }
  clickPending();
}

(async function start() {
  try { state.me = await api('/me'); } catch { state.me = { business: {} }; }
  try { state.onb = await api('/onboarding'); } catch { state.onb = null; }
  if (state.onb && !state.onb.started && !state.onb.hidden && !location.hash) location.hash = '#/setup'; // very first visit → setup guide
  window.addEventListener('hashchange', route);
  route();
})();
