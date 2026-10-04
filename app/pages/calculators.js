import { esc, $ } from '../core.js';

// NaOH SAP values (g lye per g oil). KOH = NaOH × 1.403 (liquid soap, some shampoos).
const SAP = { 'Olive oil': 0.1345, 'Coconut oil': 0.183, 'Palm oil (sustainable)': 0.142, 'Castor oil': 0.1286, 'Shea butter': 0.128, 'Cocoa butter': 0.137, 'Mango butter': 0.1371,
  'Sunflower oil': 0.134, 'Sweet almond oil': 0.1367, 'Avocado oil': 0.1339, 'Rice bran oil': 0.128, 'Grapeseed oil': 0.1265, 'Canola oil': 0.1324, 'Soybean oil': 0.135, 'Hemp seed oil': 0.1345,
  'Apricot kernel oil': 0.135, 'Argan oil': 0.136, 'Macadamia oil': 0.139, 'Jojoba oil': 0.069, 'Beeswax': 0.069, 'Lard': 0.138, 'Tallow (beef)': 0.1405, 'Neem oil': 0.1387, 'Babassu oil': 0.175, 'Stearic acid': 0.1412 };
// Typical fragrance load, % of total batch weight (start low; follow your supplier's IFRA guidance)
const FRAG = { 'Shampoo & conditioner': [0.5, 1], 'Body wash / liquid soap': [1, 2], 'Hair oil': [0.5, 1], 'Body lotion / butter': [0.5, 1], 'Cold process soap': [3, 5], 'Melt & pour soap': [1, 3],
  'Bath salts': [1, 2], 'Candles': [6, 10], 'Perfume (oil based)': [15, 25], 'Room / body mist': [2, 5] };

export function render() {
  return `<div class="head"><div><h1>Calculators</h1><div class="sub">Quick maths for formulating — nothing here changes your stock.</div></div></div>
  <div class="card"><h2>Percentage formula → grams</h2><p class="note" style="margin-top:-6px">Most shampoos, washes and lotions are written in percentages. Enter the batch size and each ingredient's %.</p>
    <div class="row" style="margin-bottom:10px;max-width:360px"><label style="margin:0;white-space:nowrap">Batch size (g)</label><input id="pBatch" type="number" value="500"></div>
    <div id="pLines"></div><button class="btn ghost small" id="pAdd" style="margin-top:6px">+ Add ingredient</button><div class="box" id="pOut" style="margin-top:12px"></div></div>
  <div class="grid2">
    <div class="card"><h2>Fragrance amount</h2>
      <div class="field"><label>Product type</label><select id="fType">${Object.keys(FRAG).map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div class="field"><label>Batch weight (g)</label><input id="fBatch" type="number" value="500"></div><div class="box" id="fOut"></div>
      <p class="note">Typical ranges — always check the maximum on your fragrance supplier's IFRA certificate.</p></div>
    <div class="card"><h2>Soap lye calculator</h2>
      <div class="grid2"><div class="field"><label>Lye</label><select id="sLye"><option value="naoh">NaOH — bar soap</option><option value="koh">KOH — liquid soap</option></select></div>
        <div class="field"><label>Superfat %</label><input id="sSf" type="number" value="5"></div>
        <div class="field"><label>Water (% of oils)</label><input id="sW" type="number" value="33"></div>
        <div class="field"><label>Fragrance (g per kg oils)</label><input id="sF" type="number" value="30"></div></div>
      <div id="sLines"></div><button class="btn ghost small" id="sAdd" style="margin-top:6px">+ Add oil</button><div class="box" id="sOut" style="margin-top:12px"></div>
      <p class="note">Always double-check with a second lye calculator before making soap, and handle lye with gloves and goggles.</p></div>
  </div>`;
}

export function after() {
  // percentage formula
  const pRow = (n = '', p = '') => { const d = document.createElement('div'); d.className = 'pline'; d.innerHTML = `<input class="desc" placeholder="Ingredient" value="${esc(n)}"><input class="q" type="number" step="any" placeholder="%" value="${p}"><span class="g note" style="width:90px;text-align:right"></span><button class="icon-btn rm">✕</button>`; d.querySelector('.rm').onclick = () => { d.remove(); pCalc(); }; d.querySelectorAll('input').forEach(i => i.oninput = pCalc); $('#pLines').appendChild(d); };
  const pCalc = () => {
    const B = Number($('#pBatch').value) || 0; let tot = 0;
    $('#pLines').querySelectorAll('.pline').forEach(d => { const p = Number(d.querySelector('.q').value) || 0; tot += p; d.querySelector('.g').textContent = p ? (Math.round(B * p) / 100) + ' g' : ''; });
    $('#pOut').innerHTML = `Total <b>${Math.round(tot * 100) / 100}%</b> ${Math.abs(tot - 100) < 0.01 ? '✓' : `<span style="color:var(--rose)">— should add up to 100% (${tot < 100 ? 'add' : 'remove'} ${Math.abs(Math.round((100 - tot) * 100) / 100)}%)</span>`}`;
  };
  [['Water', 60], ['Surfactant blend', 30], ['Glycerin', 3], ['Conditioning agent', 3], ['Fragrance oil', 1], ['Preservative', 1], ['Thickener', 2]].forEach(([n, p]) => pRow(n, p));
  $('#pAdd').onclick = () => pRow(); $('#pBatch').oninput = pCalc; pCalc();
  // fragrance
  const fCalc = () => { const [a, b] = FRAG[$('#fType').value], B = Number($('#fBatch').value) || 0; $('#fOut').innerHTML = `Use <b>${Math.round(B * a) / 100} – ${Math.round(B * b) / 100} g</b> fragrance <span class="note">(${a}–${b}%)</span>`; };
  $('#fType').onchange = fCalc; $('#fBatch').oninput = fCalc; fCalc();
  // soap
  const sRow = (oil = 'Olive oil', g = '') => { const d = document.createElement('div'); d.className = 'pline'; d.innerHTML = `<select class="mat">${Object.keys(SAP).map(k => `<option ${k === oil ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select><input class="q" type="number" step="any" placeholder="grams" value="${g}"><button class="icon-btn rm">✕</button>`; d.querySelector('.rm').onclick = () => { d.remove(); sCalc(); }; d.querySelectorAll('input,select').forEach(i => i.oninput = sCalc); $('#sLines').appendChild(d); };
  const sCalc = () => {
    let oils = 0, lye = 0;
    $('#sLines').querySelectorAll('.pline').forEach(d => { const g = Number(d.querySelector('.q').value) || 0; oils += g; lye += g * SAP[d.querySelector('.mat').value]; });
    lye *= 1 - (Number($('#sSf').value) || 0) / 100; if ($('#sLye').value === 'koh') lye *= 1.403;
    const water = oils * (Number($('#sW').value) || 0) / 100, frag = oils / 1000 * (Number($('#sF').value) || 0), r = n => Math.round(n * 10) / 10;
    $('#sOut').innerHTML = oils ? `Oils <b>${r(oils)} g</b> · ${$('#sLye').value === 'koh' ? 'KOH' : 'NaOH'} <b>${r(lye)} g</b> · Water <b>${r(water)} g</b> · Fragrance <b>${r(frag)} g</b><br>Total batch <b>${r(oils + lye + water + frag)} g</b>` : 'Add your oils to calculate.';
  };
  [['Olive oil', 400], ['Coconut oil', 250], ['Shea butter', 150], ['Castor oil', 50]].forEach(([o, g]) => sRow(o, g));
  $('#sAdd').onclick = () => sRow(); ['#sLye', '#sSf', '#sW', '#sF'].forEach(s => $(s).oninput = sCalc); sCalc();
}
