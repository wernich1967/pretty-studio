// Shared "✨ Capture" window: add one or more pages (drop / click / Ctrl+V paste / phone camera), remove any, or paste text; then ask the AI.
import { api, toast, modal, closeModal, esc, readFile } from './core.js';

const MAX_PAGES = 8;

export function captureModal({ title, intro, endpoint, textLabel, textPlaceholder, onResult }) {
  const card = modal(`<h2>${title}</h2>
    <p class="note" style="margin-top:-4px">${intro}</p>
    <label class="drop" id="drop"><input type="file" id="cf" accept="image/*,application/pdf" multiple hidden><span>📄 Drop pages here, click to choose files, or press Ctrl+V to paste a screenshot<br><span class="note">Several pages? Just keep adding — up to ${MAX_PAGES}. On a phone: tap to take a photo or pick one.</span></span></label>
    <div id="pages" class="pages"></div>
    <div class="field" style="margin-top:12px"><label>${textLabel}</label><textarea id="ct" rows="4" placeholder="${textPlaceholder}"></textarea></div>
    <div id="cmsg" class="note"></div>
    <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn ghost" id="cc">Cancel</button><button class="btn" id="go">Read it</button></div>`);
  card.classList.add('wide');
  const files = []; // { name, type, data }
  const cf = card.querySelector('#cf'), drop = card.querySelector('#drop'), msg = card.querySelector('#cmsg');
  const draw = () => {
    card.querySelector('#pages').innerHTML = files.map((f, i) => `<div class="page">${f.type.startsWith('image/') ? `<img src="${f.data}" alt="">` : '<div class="pdf">📄 PDF</div>'}
      <div class="pname">${i + 1}. ${esc(f.name)}</div><button class="pdel" data-i="${i}" title="Remove this page">✕</button></div>`).join('');
    card.querySelectorAll('.pdel').forEach(b => b.onclick = e => { e.preventDefault(); files.splice(Number(b.dataset.i), 1); draw(); });
    card.querySelector('#go').textContent = files.length > 1 ? `Read all ${files.length} pages` : 'Read it';
  };
  const add = async list => {
    for (const f of list) {
      if (!f) continue;
      if (files.length >= MAX_PAGES) { msg.textContent = `That's the maximum of ${MAX_PAGES} pages.`; break; }
      if (!/^image\/|application\/pdf/.test(f.type)) { msg.textContent = `“${f.name}” isn't a photo or PDF, so it was skipped.`; continue; }
      if (f.type === 'application/pdf' && f.size > 4 * 1024 * 1024) { msg.textContent = `“${f.name}” is over 4 MB — take a screenshot of it instead.`; continue; }
      files.push({ name: f.name || `Screenshot ${files.length + 1}`, type: f.type, data: await readFile(f) });
      msg.textContent = '';
    }
    draw();
  };
  cf.onchange = () => { add([...cf.files]); cf.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => add([...e.dataTransfer.files]));
  const onPaste = e => { const its = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith('image/')); if (its.length) { e.preventDefault(); add(its.map(i => i.getAsFile())); } };
  document.addEventListener('paste', onPaste);
  new MutationObserver((m, o) => { if (document.getElementById('modal').hidden || !card.querySelector('#drop')) { document.removeEventListener('paste', onPaste); o.disconnect(); } }).observe(document.getElementById('modal'), { attributes: true, childList: true, subtree: true });
  card.querySelector('#cc').onclick = closeModal;
  card.querySelector('#go').onclick = async e => {
    const text = card.querySelector('#ct').value.trim();
    if (!files.length && text.length < 10) return toast('Add a page or paste the text first', true);
    e.target.disabled = true; msg.innerHTML = `<span class="spin"></span> Reading${files.length > 1 ? ' ' + files.length + ' pages' : ''}… this takes 10–40 seconds.`;
    try { const out = await api(endpoint, { method: 'POST', body: { files: files.map(f => f.data), text } }); await onResult(out, files.map(f => f.data)); }
    catch (err) { e.target.disabled = false; msg.textContent = err.message === 'login' ? '' : 'Could not read it: ' + (err.message || 'unknown error'); }
  };
}
