// "Ask a question" — a small chat window. Answers come from the studio's own records (read-only look-ups on the server).
import { api, esc, icon, aiRand, $ } from './core.js';

const SOURCES = { find_items: 'stock list', item_history: 'item history', recipes: 'recipes', sales_summary: 'sales', purchases: 'purchases', batches: 'batches', expenses: 'expenses', suppliers: 'suppliers' };
const SUGGEST = ['Do I have coconut oil in stock?', 'What is running low?', 'What did I sell this month?', 'Which batches are still curing?', 'How many batches can I make of each recipe?'];
let convo = []; // this browser tab's conversation: { role: 'user'|'assistant', text, used?, cost? }

// Light formatting for answers: **bold**, "- " lists, line breaks.
function fmt(t) {
  const lines = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n');
  let html = '', list = false;
  for (const l of lines) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)/.exec(l);
    if (m) { if (!list) { html += '<ul>'; list = true; } html += `<li>${m[1]}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    html += l.trim() ? `<p>${l}</p>` : '';
  }
  return html + (list ? '</ul>' : '');
}

function bubbles() {
  if (!convo.length) return `<div class="askempty"><span class="cic warm">${icon('ai')}</span><p>Ask about your stock, recipes, batches, sales, purchases or suppliers.</p></div>`;
  return convo.map(m => m.role === 'user' ? `<div class="askq">${esc(m.text)}</div>`
    : `<div class="aska${m.error ? ' err' : ''}">${m.error ? esc(m.text) : fmt(m.text)}${m.used?.length ? `<div class="note">Checked: ${m.used.map(u => SOURCES[u] || u).join(', ')}${m.cost ? ' · ' + aiRand(m.cost) : ''}</div>` : ''}</div>`).join('');
}

// The panel slides in from the right and keeps the conversation while it's closed.
let panel = null, busy = false;
export function closeAsk() { if (panel) { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); } }
export function openAsk() {
  if (!panel) build();
  panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
  draw(); setTimeout(() => $('#askQ')?.focus(), 250);
}
function draw() {
  const msgs = $('#askMsgs'); if (!msgs) return;
  msgs.innerHTML = bubbles() + (busy ? '<div class="aska thinking"><span class="spin"></span>Looking through your records…</div>' : '');
  msgs.scrollTop = msgs.scrollHeight; $('#askSugg').hidden = convo.length > 0;
}
function build() {
  panel = document.createElement('aside');
  panel.className = 'askpanel'; panel.setAttribute('aria-label', 'Ask a question'); panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `<div class="askhead"><span class="cic warm">${icon('ai')}</span><div style="flex:1"><h2>Ask a question</h2><div class="note">Answers come from your own records. It can look, but never changes anything.</div></div><button class="icon-btn" id="askClose" aria-label="Close">✕</button></div>
    <div class="askmsgs" id="askMsgs" aria-live="polite"></div>
    <div class="askfoot">
      <div class="chips asksugg" id="askSugg">${SUGGEST.map(q => `<button type="button" class="chip">${esc(q)}</button>`).join('')}</div>
      <form class="askrow" id="askForm"><input id="askQ" maxlength="600" autocomplete="off" placeholder="e.g. Do I have shea butter in stock?"><button class="btn" id="askGo">Ask</button></form>
      <div class="row" style="justify-content:space-between;margin-top:8px"><button type="button" class="linkbtn" id="askNew" style="margin:0">New conversation</button><span class="note">About R0.05–R0.20 a question</span></div>
    </div>`;
  document.body.appendChild(panel);
  const input = $('#askQ');
  const send = async q => {
    q = q.trim(); if (!q || busy) return;
    const history = convo.filter(m => !m.error).map(m => ({ role: m.role, text: m.text }));
    convo.push({ role: 'user', text: q }); busy = true; $('#askGo').disabled = true; input.value = ''; draw();
    try {
      const r = await api('/ai/ask', { method: 'POST', body: { question: q, history } });
      convo.push({ role: 'assistant', text: r.answer, used: r.used, cost: r.cost_usd });
    } catch (e) { convo.push({ role: 'assistant', text: e.message || 'Something went wrong — try again.', error: true }); }
    busy = false; $('#askGo').disabled = false; draw(); if (panel.classList.contains('open')) input.focus();
  };
  $('#askForm').onsubmit = e => { e.preventDefault(); send(input.value); };
  $('#askSugg').querySelectorAll('button').forEach(b => b.onclick = () => send(b.textContent));
  $('#askNew').onclick = () => { if (busy) return; convo = []; draw(); input.focus(); };
  $('#askClose').onclick = closeAsk;
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open') && $('#modal').hidden) closeAsk(); });
}
