import { api, toast, esc, $ } from '../core.js';

const LABELS = { suppliers: 'Suppliers', materials: 'Inventory items', products: 'Finished products', purchases: 'Purchases', purchase_lines: 'Purchase lines', recipes: 'Recipes', recipe_lines: 'Recipe lines', batches: 'Batches', sales: 'Sales', stock_movements: 'Stock movements', files: 'Photos & invoices', videos: 'Videos' };

export function render() {
  return `<div class="head"><div><h1>Maintenance</h1><div class="sub">Backups, test data and what's stored.</div></div></div>
  <div class="grid2">
    <div class="card"><h2>Backup</h2><p class="note">Download everything as one file. Your data is also backed up automatically by Cloudflare.</p>
      <a class="btn" href="/api/maintenance/export" download>Download backup</a></div>
    <div class="card"><h2>Test data</h2><p class="note">Load the EU Serenity sample (purchases, suppliers, recipes) to try the studio out. It's tagged as <span class="pill">test</span> and can be removed in one go.</p>
      <div class="row" style="flex-wrap:wrap"><label class="btn ghost" style="margin:0;text-transform:none;letter-spacing:0;font-size:14px;color:var(--teal-d)">Load test file…<input type="file" id="tfile" accept=".json" hidden></label>
      <button class="btn danger" id="rmTest">Remove all test data</button></div>
      <div id="tmsg" class="note" style="margin-top:10px"></div></div>
  </div>
  <div class="card"><h2>✨ AI usage</h2><div id="ai"><div class="empty">Loading…</div></div></div>
  <div class="card"><h2>What's stored</h2><div id="stats"><div class="empty">Loading…</div></div></div>`;
}

async function stats() {
  const s = await api('/maintenance/stats');
  $('#stats').innerHTML = `<table class="tbl"><thead><tr><th>Data</th><th class="r">Records</th><th class="r">of which test</th></tr></thead><tbody>
    ${Object.entries(s.tables).map(([k, v]) => `<tr><td>${LABELS[k] || k}</td><td class="r">${v.n}</td><td class="r">${v.test || 0}</td></tr>`).join('')}</tbody></table>
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
  const u = await api('/ai/usage'), usd = n => '$' + (Number(n) || 0).toFixed(n < 1 ? 4 : 2);
  $('#ai').innerHTML = `${u.ready ? '' : '<div class="box aibox" style="margin-bottom:12px">AI is not switched on yet — the ANTHROPIC_API_KEY secret still needs to be added in Cloudflare.</div>'}
    <div class="tiles"><div class="tile"><div class="k">Calls this month</div><div class="v">${u.month.calls}</div></div><div class="tile"><div class="k">Cost this month</div><div class="v">${usd(u.month.cost)}</div></div><div class="tile"><div class="k">Cost all time</div><div class="v">${usd(u.all.cost)}</div></div></div>
    ${u.recent.length ? `<table class="tbl"><thead><tr><th>When</th><th>What</th><th class="r">Tokens</th><th class="r">Cost</th></tr></thead><tbody>${u.recent.map(r => `<tr><td>${esc(r.created_at)}</td><td>${esc(r.feature)}${r.ok ? '' : ' <span class="pill red" title="' + esc(r.error) + '">failed</span>'}<div class="note">${esc(r.user || '')}</div></td><td class="r">${(r.input_tokens + r.output_tokens).toLocaleString()}</td><td class="r">${usd(r.cost_usd)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No AI calls yet.</div>'}
    <p class="note">Costs are in US dollars, billed by Anthropic to the API account.</p>`;
}
