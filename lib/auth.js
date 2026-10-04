// Second lock: verify the Cloudflare Access login token on every API request.
// Needs env vars ACCESS_TEAM (e.g. "eucreations") and ACCESS_AUD (Application Audience tag).
// Until those are set, it falls back to the email header Access adds (front-door only).
let jwksCache = { team: null, keys: null, at: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const decodeJson = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(team) {
  if (jwksCache.team === team && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Could not load Access keys');
  const { keys } = await res.json();
  jwksCache = { team, keys, at: Date.now() };
  return keys;
}

export async function verifyAccess(request, env) {
  const headerEmail = request.headers.get('cf-access-authenticated-user-email');
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) {
    if (headerEmail) return { ok: true, email: headerEmail, strict: false };
    if (env.DEV_USER) return { ok: true, email: env.DEV_USER, strict: false }; // local testing only
    return { ok: false, error: 'Not signed in' };
  }
  if (!token) return { ok: false, error: 'Not signed in' };
  try {
    const [h, p, sig] = token.split('.');
    const header = decodeJson(h); const payload = decodeJson(p);
    const keys = await getKeys(env.ACCESS_TEAM);
    const jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) return { ok: false, error: 'Unknown login key' };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(h + '.' + p));
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!valid || !aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now()) return { ok: false, error: 'Login expired — please refresh' };
    return { ok: true, email: payload.email, strict: true };
  } catch (e) { return { ok: false, error: 'Login check failed' }; }
}
