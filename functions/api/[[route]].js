import { makeRouter } from '../../lib/router.js';
import { json } from '../../lib/db.js';
import * as settings from '../../lib/api/settings.js';
import * as stockitems from '../../lib/api/stockitems.js';
import * as maintenance from '../../lib/api/maintenance.js';
import * as purchases from '../../lib/api/purchases.js';
import * as recipes from '../../lib/api/recipes.js';
import * as videos from '../../lib/api/videos.js';
import * as sales from '../../lib/api/sales.js';
import * as ai from '../../lib/api/ai.js';

const router = makeRouter();
settings.register(router);
stockitems.register(router);
maintenance.register(router);
purchases.register(router);
recipes.register(router);
videos.register(router);
sales.register(router);
ai.register(router);

export async function onRequest(ctx) {
  const path = new URL(ctx.request.url).pathname.replace(/^\/api/, '') || '/';
  const res = await router.handle(ctx, path);
  return res || json({ error: 'Not found' }, 404);
}
