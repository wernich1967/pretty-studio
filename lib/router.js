// Tiny router: add('GET', '/categories/:id', handler)
export function makeRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler });
  };
  const handle = async (ctx, path) => {
    for (const r of routes) {
      if (r.method !== ctx.request.method) continue;
      const m = path.match(r.re); if (!m) continue;
      const params = {}; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
      return r.handler(ctx, params);
    }
    return null;
  };
  return { add, handle };
}
