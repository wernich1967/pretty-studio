import { api, toast, modal, closeModal, esc, $ } from '../core.js';

export function render() {
  return `<div class="head"><div><h1>Videos</h1><div class="sub">Tutorials and inspiration, kept in one place.</div></div><button class="btn" id="addV">+ Add video</button></div>
    <div class="card"><div class="row" style="margin-bottom:14px"><input id="q" placeholder="Search videos…"><select id="cat" style="max-width:220px"></select></div><div id="grid" class="rgrid"><div class="empty">Loading…</div></div></div>`;
}
export async function after() {
  const rows = await api('/videos');
  const cats = [...new Set(rows.map(v => v.category).filter(Boolean))].sort();
  $('#cat').innerHTML = `<option value="">All topics</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}`;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), c = $('#cat').value;
    const list = rows.filter(v => (!c || v.category === c) && (!q || `${v.title} ${v.category}`.toLowerCase().includes(q)));
    $('#grid').innerHTML = list.length ? list.map(v => `<div class="rcard" data-id="${v.id}">
      <div class="rimg" style="${v.yt ? `background-image:url('https://i.ytimg.com/vi/${v.yt}/mqdefault.jpg')` : ''}">${v.yt ? '<span class="play">▶</span>' : '<span>🔗 Link</span>'}</div>
      <div class="rbody"><b>${esc(v.title || 'Untitled video')}</b>${v.source === 'test' ? ' <span class="pill">test</span>' : ''}<div class="note">${esc(v.category || '')}</div></div></div>`).join('')
      : `<div class="empty" style="grid-column:1/-1">${rows.length ? 'Nothing matches.' : 'No videos yet — paste a YouTube link with “Add video”.'}</div>`;
    $('#grid').querySelectorAll('.rcard').forEach(el => el.onclick = () => play(rows.find(v => v.id === el.dataset.id)));
  };
  $('#q').oninput = draw; $('#cat').onchange = draw;
  $('#addV').onclick = () => form(cats);
  draw();
}
function play(v) {
  const card = modal(`<h2>${esc(v.title || 'Video')}</h2><div class="note" style="margin-bottom:10px">${esc(v.category || '')}</div>
    ${v.yt ? `<div class="vwrap"><iframe src="https://www.youtube-nocookie.com/embed/${v.yt}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : ''}
    <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn danger small" id="del">Remove</button><div class="row"><a class="btn ghost" href="${esc(v.url)}" target="_blank" rel="noopener">Open on YouTube</a><button class="btn" data-close>Close</button></div></div>`);
  card.classList.add('wide');
  card.querySelector('#del').onclick = function () {
    if (!this.dataset.sure) { this.dataset.sure = 1; this.textContent = 'Click again to remove'; return; }
    api('/videos/' + v.id, { method: 'DELETE' }).then(() => { closeModal(); toast('Video removed'); after(); });
  };
}
function form(cats) {
  const card = modal(`<h2>Add video</h2>
    <div class="field"><label>Link</label><input id="url" placeholder="https://www.youtube.com/watch?v=…"></div>
    <div class="field"><label>Title</label><input id="title" placeholder="e.g. Cold process shampoo bar"></div>
    <div class="field"><label>Topic</label><input id="vcat" list="vcats" placeholder="e.g. Hair care"><datalist id="vcats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="save">Save</button></div>`);
  card.querySelector('#cancel').onclick = closeModal;
  card.querySelector('#save').onclick = async () => { await api('/videos', { method: 'POST', body: { url: $('#url').value.trim(), title: $('#title').value, category: $('#vcat').value } }); closeModal(); toast('Video added'); after(); };
  $('#url').focus();
}
