import { ensureSchema, json } from '../../lib/db.js';
import { verifyAccess, isAdmin } from '../../lib/auth.js';

export async function onRequest(ctx) {
  const { request, env, data } = ctx;
  if (new URL(request.url).pathname === '/api/health') return ctx.next();
  const auth = await verifyAccess(request, env);
  if (!auth.ok) return json({ error: auth.error }, 401);
  data.user = auth.email; data.strict = auth.strict;
  data.admin = isAdmin(auth.email, env);
  if (new URL(request.url).pathname.startsWith('/api/maintenance') && !data.admin) return json({ error: 'Maintenance is only available to the studio administrator' }, 403);
  if (!env.DB) return json({ error: 'Database not connected' }, 500);
  try {
    await ensureSchema(env.DB);
    return await ctx.next();
  } catch (e) {
    return json({ error: 'Something went wrong: ' + e.message }, 500);
  }
}
