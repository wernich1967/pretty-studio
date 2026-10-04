export const uid = () => crypto.randomUUID();
export async function body(request) { try { return await request.json(); } catch { return {}; } }
export function clean(s, max = 200) { return String(s ?? '').trim().slice(0, max); }
