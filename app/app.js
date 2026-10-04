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

const APP_VERSION = CHANGELOG[0].version, APP_DATE = CHANGELOG[0].date;
const PAGES = [
  { id: 'overview', label: 'Overview', mod: overview },
  { id: 'inventory', label: 'Inventory', mod: stock },
  { id: 'products', label: 'Finished products', mod: stock },
  { id: 'purchases', label: 'Purchases', mod: purchases },
  { id: 'recipes', label: 'Recipes', mod: recipes },
  { id: 'batches', label: 'Make a batch', mod: batches },
  { id: 'curing', label: 'Curing', mod: curing },
  { id: 'sales', label: 'Sales', mod: sales },
  { id: 'financial', label: 'Financial', mod: financial },
  { id: 'calculators', label: 'Calculators', mod: calculators },
  { id: 'videos', label: 'Videos', mod: videos },
  { id: 'settings', label: 'Settings', mod: settings },
  { id: 'maintenance', label: 'Maintenance', mod: maintenance },
  { id: 'help', label: 'Help', soon: true }
];

function renderNav() {
  $('#nav').innerHTML = PAGES.map(p => `<a href="#/${p.id}" class="${p.id === state.page ? 'on' : ''}">${p.label}${p.soon ? '<span class="soon">soon</span>' : ''}</a>`).join('');
  $('#ver').textContent = `Version ${APP_VERSION} · ${new Date(APP_DATE).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  $('#copy').textContent = `© ${new Date().getFullYear()} ${state.me?.business?.name || 'Pretty'} Studio. All rights reserved.`;
}
window.addEventListener('unhandledrejection', e => e.preventDefault()); // errors are already shown as a message
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.dataset.close !== undefined) $('#modal').hidden = true; });
$('#ver').addEventListener('click', () => modal(`<h2>What's new</h2><div class="cl">${CHANGELOG.map(c => `<h3>Version ${c.version} <span class="note">· ${c.date}</span></h3><ul>${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</div><div style="text-align:right;margin-top:18px"><button class="btn" data-close>Close</button></div>`));
$('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('open'));

const soon = p => `<div class="head"><div><h1>${p.label}</h1></div></div><div class="card soonbox"><div class="badge">Coming in the next update</div>
  <p class="note">This page is part of version 1.0 and is being built now. You'll see it appear here automatically when it's ready.</p></div>`;

async function route() {
  const id = (location.hash.replace('#/', '') || 'overview').split('?')[0];
  const p = PAGES.find(x => x.id === id) || PAGES[0];
  state.page = p.id; renderNav(); $('#side').classList.remove('open'); $('#modal').hidden = true;
  $('#page').innerHTML = p.soon ? soon(p) : p.mod.render(p.id);
  window.scrollTo(0, 0);
  if (p.mod?.after) { try { await p.mod.after(p.id === 'settings' ? { renderNav } : p.id); } catch (e) { console.error(e); } }
}

(async function start() {
  try { state.me = await api('/me'); } catch { state.me = { business: {} }; }
  window.addEventListener('hashchange', route);
  route();
})();
