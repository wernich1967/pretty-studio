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

// Line icons (24×24 outline paths) for the menu, footer, phone bar and card headings.
const ICON_PATHS = {
  overview: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  setup: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  purchases: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  suppliers: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
  recipes: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  batches: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  sales: 'M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0',
  inventory: 'M8 3h8M9 3v3a5 5 0 0 0-3 5v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a5 5 0 0 0-3-5V3',
  products: 'M10 3h4v3h-4zM8 6h8l1 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9z',
  financial: 'M4 19V5M4 19h16M8 15v-3M12 15V8M16 15v-5',
  calculators: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  videos: 'M4 6h16v12H4zM10 9l5 3-5 3z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  maintenance: 'M14 6a4 4 0 0 0 5 5l-8 8a2 2 0 0 1-3-3l8-8a4 4 0 0 0-2-2z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  database: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  palette: 'M12 3a9 9 0 0 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  menu: 'M4 7h16M4 12h16M4 17h16'
};
export const icon = name => ICON_PATHS[name] ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>` : '';

// Colour themes. Saved with the business details; also kept in this browser so the page opens in the right colours.
export const THEMES = [
  { id: 'sage', name: 'Sage & kraft', note: 'Natural, earthy', sw: ['#f3eee4', '#66775a', '#9a7044', '#e8ebdf'] },
  { id: 'sea', name: 'Sea glass', note: 'Fresh, calm', sw: ['#f5f9f9', '#3f8a8c', '#d27d8a', '#ecf4f3'] },
  { id: 'rose', name: 'Rose clay', note: 'Soft, warm', sw: ['#f6efec', '#9a5f6b', '#9b7348', '#f3e5e6'] }
];
export function setSkin(id) {
  const s = THEMES.some(t => t.id === id) ? id : 'sage';
  document.documentElement.dataset.skin = s;
  try { localStorage.setItem('ps-skin', s); } catch {}
  return s;
}
// Theme cards; picking one previews it straight away and saves it.
export function themePicker(box) {
  const cur = document.documentElement.dataset.skin || 'sage';
  box.innerHTML = `<div class="skins">${THEMES.map(t => `<button type="button" class="skin ${t.id === cur ? 'on' : ''}" data-skin="${t.id}" aria-pressed="${t.id === cur}">
    <span class="sw">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span><span>${t.name}<br><span class="note">${t.note}</span></span></button>`).join('')}</div>`;
  box.querySelectorAll('.skin').forEach(b => b.onclick = async () => {
    const id = setSkin(b.dataset.skin);
    box.querySelectorAll('.skin').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    const r = await api('/settings/theme', { method: 'PUT', body: { theme: id } });
    if (state.me) state.me.business = r;
    toast('Colours saved');
  });
}
