import { api, toast, esc, $, state, icon } from '../core.js';

const LABELS = { suppliers: 'Suppliers', materials: 'Ingredients & supplies', products: 'Finished products', purchases: 'Purchases', purchase_lines: 'Purchase lines', recipes: 'Recipes', recipe_lines: 'Recipe lines', batches: 'Batches', sales: 'Sales', stock_movements: 'Stock movements', files: 'Photos & invoices', videos: 'Videos' };
const MAIN = ['materials', 'products', 'recipes', 'purchases', 'batches', 'sales', 'suppliers', 'files'];
const FEATURES = { 'invoice-capture': ['Invoice captured', 'purchases', ''], 'recipe-capture': ['Recipe captured', 'recipes', 'g'] };
const ZAR_PER_USD = 18.2; // rough rate for showing AI costs in rand; Anthropic bills in dollars

export function render() {
  return `<div class="head"><div><h1>Maintenance</h1><div class="sub">Backups, sample data and what's stored in the studio.</div></div></div>
  <div class="grid2">
    <div class="card"><div class="chead"><span class="cic">${icon('download')}</span><div><h2>Backup</h2><div class="note">Everything in one file</div></div></div>
      <div class="mchips"><span class="mchip"><i></i>Cloudflare also backs up your data automatically</span></div>
      <p class="note">Download a copy for your own records — once a month is a good habit.</p>
      <a class="btn" href="/api/maintenance/export" download>Download backup</a></div>
    <div class="card rel" id="testCard"><div class="chead"><span class="cic warm">${icon('batches')}</span><div><h2>Test data</h2><div class="note">For trying the studio out</div></div></div>
      <p class="note">Load the EU Serenity sample (purchases, suppliers, recipes) to practise. It's tagged as <span class="pill">test</span> and can be removed in one go.</p>
      <div class="row" style="flex-wrap:wrap"><label class="btn ghost" style="margin:0;text-transform:none;letter-spacing:0;font-size:14px;color:var(--teal-d)">Load test file…<input type="file" id="tfile" accept=".json" hidden></label>
      <button class="btn danger" id="rmTest">Remove all test data</button></div>
      <div id="tmsg" class="note" style="margin-top:10px"></div></div>
  </div>
  <div class="card"><div class="chead"><span class="cic warm">${icon('setup')}</span><div><h2>AI usage</h2><div class="note">Invoice and recipe capture</div></div></div><div id="ai"><div class="empty">Loading…</div></div></div>
  <div class="card"><div class="chead"><span class="cic">${icon('database')}</span><div><h2>What's stored</h2><div class="note">Records in the studio right now</div></div></div><div id="stats"><div class="empty">Loading…</div></div></div>`;
}

async function stats() {
  const s = await api('/maintenance/stats'), t = s.tables, tests = Object.values(t).reduce((a, v) => a + (v.test || 0), 0);
  const card = $('#testCard'); card?.querySelector('.ktag')?.remove();
  if (card && tests) card.insertAdjacentHTML('afterbegin', `<span class="ktag">${tests.toLocaleString('en-ZA')} test records</span>`);
  $('#stats').innerHTML = `<div class="store">${MAIN.filter(k => t[k]).map(k => `<div><b>${t[k].n.toLocaleString('en-ZA')}</b><span>${LABELS[k]}${t[k].test ? ` · ${t[k].test} test` : ''}</span></div>`).join('')}</div>
    <details style="margin-top:12px"><summary class="note">All tables</summary><table class="tbl"><thead><tr><th>Data</th><th class="r">Records</th><th class="r">of which test</th></tr></thead><tbody>
    ${Object.entries(t).map(([k, v]) => `<tr><td>${LABELS[k] || k}</td><td class="r">${v.n}</td><td class="r">${v.test || 0}</td></tr>`).join('')}</tbody></table></details>
    <div class="note" style="margin-top:8px">Database version ${s.schemaVersion}</div>`;
}

export async function after() {
  stats(); aiUsage();
  $('#tfile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const msg = t => $('#tmsg').innerHTML = t;
    let d; try { d = JSON.parse(await file.text()); } catch { return msg('That file isn\'t a valid backup.'); }
    if (!Array.isArray(d.purchases)) return msg('That doesn\'t look like an EU Serenity backup.');
    msg('Loading purchases…');
    try {
      const r = await api('/maintenance/import/serenity-purchases', { method: 'POST', body: { purchases: d.purchases } });
      let n = 0;
      for (const rec of d.recipes || []) { msg(`Loading recipes… ${++n} of ${d.recipes.length}`); await api('/maintenance/import/serenity-recipe', { method: 'POST', body: { recipe: rec } }); }
      if (d.videos?.length) await api('/maintenance/import/serenity-videos', { method: 'POST', body: { videos: d.videos } });
      msg(`✓ Loaded ${r.materials} inventory items, ${r.purchases} purchases from ${r.suppliers} suppliers and ${n} recipes.`);
      toast('Test data loaded'); stats();
    } catch (err) { msg(esc(err.message)); }
    e.target.value = '';
  };
  $('#rmTest').onclick = () => {
    $('#tmsg').innerHTML = `Type <b>DELETE</b> to remove all test data: <div class="row" style="margin-top:6px"><input id="conf" style="max-width:160px"><button class="btn small danger" id="go">Remove</button></div>`;
    $('#go').onclick = async () => {
      const r = await api('/maintenance/remove-test-data', { method: 'POST', body: { confirm: $('#conf').value.trim() } });
      $('#tmsg').textContent = `✓ Test data removed (${r.filesRemoved} photos).`; toast('Test data removed'); stats();
    };
  };
}

async function aiUsage() {
  const u = await api('/ai/usage');
  const rand = n => 'R' + ((Number(n) || 0) * ZAR_PER_USD).toFixed(2), usd = n => '$' + (Number(n) || 0).toFixed(4);
  const when = t => { const d = new Date(String(t).replace(' ', 'T') + 'Z'); return isNaN(d) ? esc(t) : `<b>${d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</b><div class="note">${d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>`; };
  const who = e => !e ? '—' : e === state.me?.email ? (state.me.business?.ownerName || 'You') : e.split('@')[0];
  const max = Math.max(1, ...u.recent.map(r => r.input_tokens + r.output_tokens));
  const per = u.month.calls ? u.month.cost / u.month.calls : 0;
  $('#ai').innerHTML = `${u.ready ? '' : '<div class="box aibox" style="margin-bottom:12px">AI is not switched on yet — the ANTHROPIC_API_KEY secret still needs to be added in Cloudflare.</div>'}
    <div class="tiles"><div class="tile stile"><div class="k">Captures this month</div><div class="v">${u.month.calls}</div></div>
      <div class="tile stile"><div class="k">Cost this month</div><div class="v">${rand(u.month.cost)}</div><div class="note">${usd(u.month.cost)}</div></div>
      <div class="tile stile"><div class="k">Average per capture</div><div class="v">${rand(per)}</div><div class="note">All time: ${rand(u.all.cost)} · ${u.all.calls} captures</div></div></div>
    ${u.recent.length ? `<table class="tbl"><thead><tr><th class="band">When</th><th class="band">What</th><th class="band">By</th><th class="band r">Size</th><th class="band r">Cost</th></tr></thead><tbody>${u.recent.map(r => {
      const f = FEATURES[r.feature] || [r.feature, 'setup', ''], tok = r.input_tokens + r.output_tokens, name = who(r.user);
      return `<tr><td>${when(r.created_at)}</td><td><div class="what"><span class="mini ${f[2]}">${icon(f[1])}</span><span>${esc(f[0])}${r.ok ? '' : ' <span class="pill red" title="' + esc(r.error) + '">failed</span>'}</span></div></td>
        <td class="note"><span class="av">${esc(name.slice(0, 1).toUpperCase())}</span>${esc(name)}</td><td class="r">${tok.toLocaleString('en-ZA')}<div class="tbar"><i style="width:${Math.round(tok / max * 100)}%"></i></div></td><td class="r">${rand(r.cost_usd)}<div class="note">${usd(r.cost_usd)}</div></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">No AI captures yet.</div>'}
    <p class="note">Anthropic bills in US dollars; rand amounts use about R${ZAR_PER_USD.toFixed(2)} to the dollar. Size is the number of tokens (pieces of text) the AI read and wrote.</p>`;
}
