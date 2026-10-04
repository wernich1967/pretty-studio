export const state = { me: null, page: 'overview' };
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => 'R ' + (Number(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (n, u) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-ZA') + (u ? ' ' + u : '');
export const today = () => new Date().toISOString().slice(0, 10);
export const UNITS = ['g', 'kg', 'ml', 'l', 'each', 'pack'];
export const REASONS = { opening: 'Opening stock', purchase: 'Purchase', batch_use: 'Used in batch', batch_output: 'Made in batch', sale: 'Sale', adjustment: 'Adjustment' };

export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { method: opts.method || 'GET', headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { toast('Your login has expired — refreshing…', true); setTimeout(() => location.reload(), 1500); throw new Error('login'); }
  if (!res.ok) { toast(data.error || 'Something went wrong', true); throw new Error(data.error); }
  return data;
}
export function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3000); }
export function modal(html) { $('#modalCard').innerHTML = html; $('#modal').hidden = false; return $('#modalCard'); }
export function closeModal() { $('#modal').hidden = true; }
export function options(list, selected, blank) {
  return (blank ? `<option value="">${esc(blank)}</option>` : '') + list.map(o => `<option value="${esc(o.value)}" ${o.value === selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
}
let catCache = {};
export async function categories(kind, fresh) {
  if (fresh || !catCache[kind]) catCache[kind] = await api('/categories?kind=' + kind);
  return catCache[kind];
}
export function clearCatCache() { catCache = {}; }
