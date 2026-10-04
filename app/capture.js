// Shared "✨ Capture" window: drop / click / paste a photo or PDF, or paste text, then ask the AI.
import { api, toast, modal, closeModal, esc, readFile } from './core.js';

export function captureModal({ title, intro, endpoint, textLabel, textPlaceholder, onResult }) {
  const card = modal(`<h2>${title}</h2>
    <p class="note" style="margin-top:-4px">${intro}</p>
    <label class="drop" id="drop"><input type="file" id="cf" accept="image/*,application/pdf" hidden><span id="dropTxt">📄 Drop it here, click to choose a file, or press Ctrl+V to paste a screenshot<br><span class="note">On a phone: tap to take a photo or pick one · JPG, PNG or PDF</span></span></label>
    <div class="field" style="margin-top:12px"><label>${textLabel}</label><textarea id="ct" rows="4" placeholder="${textPlaceholder}"></textarea></div>
    <div id="cmsg" class="note"></div>
    <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn ghost" id="cc">Cancel</button><button class="btn" id="go">Read it</button></div>`);
  let file = null;
  const cf = card.querySelector('#cf'), drop = card.querySelector('#drop'), txt = card.querySelector('#dropTxt');
  const take = async f => {
    if (!f) return;
    if (!/^image\/|application\/pdf/.test(f.type)) return txt.innerHTML = 'That file type isn\'t supported — use a photo (JPG/PNG) or a PDF.';
    if (f.type === 'application/pdf' && f.size > 4 * 1024 * 1024) { file = null; return txt.innerHTML = 'That PDF is over 4 MB — take a photo or screenshot of it instead.'; }
    file = await readFile(f);
    txt.innerHTML = f.type.startsWith('image/') ? `<img src="${file}" style="max-height:160px;border-radius:8px"><br><span class="note">${esc(f.name || 'Pasted screenshot')} · click to change</span>` : `📄 ${esc(f.name)} <span class="note">· click to change</span>`;
  };
  cf.onchange = () => take(cf.files[0]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => take(e.dataTransfer.files[0]));
  const onPaste = e => { const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (it) { e.preventDefault(); take(it.getAsFile()); } };
  document.addEventListener('paste', onPaste);
  new MutationObserver((m, o) => { if (document.getElementById('modal').hidden || !card.querySelector('#drop')) { document.removeEventListener('paste', onPaste); o.disconnect(); } }).observe(document.getElementById('modal'), { attributes: true, childList: true, subtree: true });
  card.querySelector('#cc').onclick = closeModal;
  card.querySelector('#go').onclick = async e => {
    const text = card.querySelector('#ct').value.trim();
    if (!file && text.length < 10) return toast('Add a photo, PDF or paste the text first', true);
    e.target.disabled = true; card.querySelector('#cmsg').innerHTML = '<span class="spin"></span> Reading… this takes 10–30 seconds.';
    try { const out = await api(endpoint, { method: 'POST', body: file ? { file } : { text } }); await onResult(out, file); }
    catch (err) { e.target.disabled = false; card.querySelector('#cmsg').textContent = err.message === 'login' ? '' : 'Could not read it: ' + (err.message || 'unknown error'); }
  };
}
