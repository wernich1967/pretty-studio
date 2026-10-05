// Guided tour: dims the page, spotlights one thing at a time with a short popup ("1 of 9", Back / Next).
// Usage: startTour(MAIN_TOUR). A step is { target: CSS selector, title, text, page?: 'overview' }.
// Keys: → / Enter next, ← back, Esc close. Steps whose target can't be found are skipped.

export const MAIN_TOUR = [
  { page: 'overview', target: '#tiles', title: 'Your day at a glance', text: 'Sales this month, low stock, batches curing and what your stock is worth — updated every time you buy, make or sell.' },
  { target: '#newBtn', mobile: '#bbNew', title: '＋ New — your shortcut', text: 'Bought something, made a batch or sold something? Start here from any page — it opens the right form straight away.' },
  { target: '#nav a[href="#/purchases"]', title: 'Buy', text: 'Record what you buy and the stock goes up by itself. ✨ Snap a photo of an invoice and the AI fills it in. Your suppliers are listed just below.' },
  { target: '#nav a[href="#/recipes"]', title: 'Recipes', text: 'Your formulas, linked to your ingredients, with the cost of a batch worked out from what you actually paid.' },
  { target: '#nav a[href="#/batches"]', title: 'Batches', text: 'Make a batch: ingredients come out of stock, finished products go in, with a batch number and best-before date. Anything still curing shows at the top.' },
  { target: '#nav a[href="#/sales"]', title: 'Sell', text: 'Record a sale — prices fill in, stock goes down and the profit on that sale is worked out.' },
  { target: '#nav a[href="#/inventory"]', title: 'Stock', text: 'Everything on your shelves: ingredients & supplies, and your finished products. The little pink number means something is running low.' },
  { target: '#nav a[href="#/financial"]', title: 'Money', text: 'Money in, money out and your real profit by month — add courier, market fees and other costs here too.' },
  { target: '#nav a[href="#/calculators"]', title: 'Tools', text: 'Handy calculators (percentages to grams, fragrance amounts, soap lye) and your saved how-to videos.' },
  { target: '#footNav', title: 'Settings & help', text: 'Your business details and categories live in Settings. Click the version label below to see what’s new. You can take this tour again from the Overview page.' }
];

let cur = null;

export function startTour(steps, onDone) {
  endTour();
  const el = document.createElement('div');
  el.className = 'tour';
  el.innerHTML = `<div class="tour-block"></div><div class="tour-spot"></div>
    <div class="tour-pop" role="dialog" aria-live="polite"><div class="tour-count"></div><h3 class="tour-title"></h3><p class="tour-text"></p>
      <div class="tour-foot"><button class="linkbtn tour-skip">Skip tour</button><span style="flex:1"></span>
        <button class="btn ghost small tour-back">Back</button><button class="btn small tour-next">Next</button></div></div>`;
  document.body.appendChild(el);
  cur = { steps, i: 0, el, onDone, dir: 1 };
  el.querySelector('.tour-next').onclick = () => move(1);
  el.querySelector('.tour-back').onclick = () => move(-1);
  el.querySelector('.tour-skip').onclick = () => endTour();
  el.querySelector('.tour-block').onclick = () => move(1);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  show();
}

export function endTour(finished) {
  if (!cur) return;
  const { el, onDone } = cur; cur = null;
  el.remove();
  document.querySelector('#side')?.classList.remove('open');
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
  onDone?.(!!finished);
}

function onKey(e) {
  if (!cur) return;
  if (e.key === 'Escape') endTour();
  if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); move(1); }
  if (e.key === 'ArrowLeft') move(-1);
}

function move(d) {
  const n = cur.i + d;
  if (n < 0) return;
  if (n >= cur.steps.length) return endTour(true);
  cur.i = n; cur.dir = d; show();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function find(sel) { for (let t = 0; t < 30; t++) { const x = document.querySelector(sel); if (x && x.offsetParent !== null || x?.closest('#side, #bbar')) return x; await sleep(100); } return null; }

async function show() {
  const c = cur, s = c.steps[c.i];
  c.el.classList.add('moving');
  if (s.page && !location.hash.startsWith('#/' + s.page)) { location.hash = '#/' + s.page; await sleep(150); }
  const phone = window.innerWidth <= 820, sel = (phone && s.mobile) || s.target;
  const inMenu = !(phone && s.mobile) && (sel.startsWith('#nav') || ['#ver', '#newBtn', '#footNav'].includes(sel));
  document.querySelector('#side')?.classList.toggle('open', inMenu && window.innerWidth <= 820); // phone: slide the menu out
  const t = await find(sel);
  if (cur !== c) return;
  if (!t) return move(c.dir || 1); // not on screen — skip it
  c.target = t;
  if (!inMenu) t.scrollIntoView({ block: 'center', behavior: 'instant' });
  const total = c.steps.length;
  c.el.querySelector('.tour-count').innerHTML = `<span>${c.i + 1} of ${total}</span><span class="tour-dots">${c.steps.map((_, j) => `<i class="${j === c.i ? 'on' : ''}"></i>`).join('')}</span>`;
  c.el.querySelector('.tour-title').textContent = s.title;
  c.el.querySelector('.tour-text').textContent = s.text;
  c.el.querySelector('.tour-back').hidden = c.i === 0;
  c.el.querySelector('.tour-next').textContent = c.i === total - 1 ? 'Finish' : 'Next';
  await sleep(inMenu && window.innerWidth <= 820 ? 220 : 0); // let the phone menu finish sliding
  place();
  c.el.classList.remove('moving');
  c.el.querySelector('.tour-next').focus({ preventScroll: true });
}

function place() {
  if (!cur?.target) return;
  const r = cur.target.getBoundingClientRect(), pad = 6, gap = 14;
  const spot = cur.el.querySelector('.tour-spot'), pop = cur.el.querySelector('.tour-pop');
  Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  const W = window.innerWidth, H = window.innerHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x, y, side;
  if (r.right + gap + pw < W - 8) { x = r.right + gap; y = r.top + r.height / 2 - ph / 2; side = 'right'; }
  else if (r.bottom + gap + ph < H - 8) { x = r.left + r.width / 2 - pw / 2; y = r.bottom + gap; side = 'below'; }
  else if (r.top - gap - ph > 8) { x = r.left + r.width / 2 - pw / 2; y = r.top - gap - ph; side = 'above'; }
  else { x = W / 2 - pw / 2; y = H - ph - 16; side = 'free'; }
  x = Math.max(8, Math.min(x, W - pw - 8)); y = Math.max(8, Math.min(y, H - ph - 8));
  Object.assign(pop.style, { left: x + 'px', top: y + 'px' });
  pop.dataset.side = side;
}
