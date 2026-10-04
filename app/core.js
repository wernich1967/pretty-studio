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

// Read a chosen file as a data URL; photos are shrunk to max 1600px so uploads stay small.
export function readFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 8 * 1024 * 1024 && !file.type.startsWith('image/')) return reject(new Error('That file is too big (max 8 MB)'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read the file'));
    fr.onload = () => {
      if (!file.type.startsWith('image/')) return resolve(fr.result);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(fr.result);
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// Unit conversion for recipes → stock. g↔ml is treated as 1:1 (close enough for most oils & liquids; flagged in the UI).
const BASE = { g: ['m', 1], kg: ['m', 1000], ml: ['v', 1], l: ['v', 1000], each: ['c', 1], pack: ['p', 1] };
export function convert(q, from, to) {
  const a = BASE[from], b = BASE[to]; if (!a || !b) return null;
  if (a[0] === b[0]) return q * a[1] / b[1];
  if ((a[0] === 'm' && b[0] === 'v') || (a[0] === 'v' && b[0] === 'm')) return q * a[1] / b[1]; // assume 1 g ≈ 1 ml
  return null;
}
export const approx = (from, to) => BASE[from] && BASE[to] && BASE[from][0] !== BASE[to][0];
