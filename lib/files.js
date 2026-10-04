// Store an uploaded file (sent as a data URL) in R2 and record it in the files table.
export function dataUrlToBytes(d) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(d || ''); if (!m) return null;
  const bin = atob(m[2]); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes: out };
}
const OK = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;
export async function saveFile(env, key, dataUrl, kind, name, source = 'live') {
  const f = dataUrlToBytes(dataUrl); if (!f || !env.FILES) return null;
  if (!OK.test(f.mime)) throw new Error('Only photos (JPG/PNG) and PDFs can be attached');
  if (f.bytes.length > 8 * 1024 * 1024) throw new Error('That file is too big (max 8 MB)');
  await env.FILES.put(key, f.bytes, { httpMetadata: { contentType: f.mime } });
  await env.DB.prepare('INSERT OR REPLACE INTO files (key, kind, name, mime, size, source) VALUES (?,?,?,?,?,?)').bind(key, kind, name || null, f.mime, f.bytes.length, source).run();
  return key;
}
export async function deleteFile(env, key) {
  if (!key) return;
  try { await env.FILES.delete(key); } catch { }
  await env.DB.prepare('DELETE FROM files WHERE key=?').bind(key).run();
}
