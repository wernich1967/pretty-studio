import { makeRouter } from '../../lib/router.js';
import { json } from '../../lib/db.js';
import * as settings from '../../lib/api/settings.js';

const router = makeRouter();
settings.register(router);

export async function onRequest(ctx) {
  const path = new URL(ctx.request.url).pathname.replace(/^\/api/, '') || '/';
  const res = await router.handle(ctx, path);
  return res || json({ error: 'Not found' }, 404);
}
