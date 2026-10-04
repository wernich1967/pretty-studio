import { json } from '../db.js';
import { body } from '../util.js';
import { callTool, MODELS } from '../ai.js';

const INVOICE_TOOL = {
  name: 'record_invoice',
  description: 'Record the details of a supplier invoice, receipt or order confirmation.',
  input_schema: {
    type: 'object',
    properties: {
      supplier_name: { type: 'string', description: 'Business that sold the goods' },
      invoice_number: { type: 'string', description: 'Invoice / order / receipt number, empty if none' },
      date: { type: 'string', description: 'Invoice date as YYYY-MM-DD, empty if unknown' },
      total: { type: 'number', description: 'Grand total paid, including delivery, in the invoice currency' },
      currency: { type: 'string', description: 'ISO code, e.g. ZAR' },
      delivery_fee: { type: 'number', description: 'Delivery/shipping charged, 0 if none' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Product name as on the invoice, cleaned up (no SKU codes)' },
            quantity: { type: 'number', description: 'TOTAL amount bought in the unit below. E.g. 2 × 1 L bottles = 2000 ml; 3 × 500 g = 1500 g; 10 jars = 10 each' },
            unit: { type: 'string', enum: ['g', 'kg', 'ml', 'l', 'each', 'pack'] },
            line_total: { type: 'number', description: 'Amount paid for this line' },
            match: { type: ['string', 'null'], description: 'Exact name of the matching item from the inventory list provided, or null if none clearly matches' },
            category: { type: 'string', enum: ['Ingredient', 'Oil & Butter', 'Fragrance & Essential Oil', 'Packaging', 'Labels', 'Equipment & Tools', 'Other supply'], description: 'Best category for a new item' }
          },
          required: ['description', 'quantity', 'unit', 'line_total']
        }
      },
      notes: { type: 'string', description: 'Anything the owner should double-check, e.g. unreadable lines' }
    },
    required: ['supplier_name', 'lines']
  }
};

const RECIPE_TOOL = {
  name: 'record_recipe',
  description: 'Record a cosmetic / soap / hair-care recipe.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Recipe name' },
      category: { type: ['string', 'null'], description: 'Exact name from the product category list provided, or null' },
      yield_qty: { type: ['number', 'null'], description: 'Total batch size, e.g. 500' },
      yield_unit: { type: 'string', enum: ['g', 'kg', 'ml', 'l', 'each', 'pack'] },
      was_percentage: { type: 'boolean', description: 'True if the source gave amounts as percentages (then amounts below are already converted for the batch size)' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'number', description: 'Amount for the batch' },
            unit: { type: 'string', enum: ['g', 'kg', 'ml', 'l', 'each', 'pack'] },
            match: { type: ['string', 'null'], description: 'Exact name of the matching inventory item from the list provided, or null' }
          },
          required: ['name', 'quantity', 'unit']
        }
      },
      method: { type: 'string', description: 'Step-by-step method, one step per line, numbered' },
      notes: { type: 'string', description: 'Tips, warnings, curing time, storage, variations' },
      uncertain: { type: 'string', description: 'Anything unreadable or that the owner should double-check' }
    },
    required: ['name', 'ingredients']
  }
};

// Build Claude content blocks from { files: [dataURL…] } (or legacy { file }) plus optional { text }
function pages(b) {
  const list = (Array.isArray(b.files) ? b.files : b.file ? [b.file] : []).slice(0, 8);
  const blocks = [];
  for (const f of list) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(f || '');
    if (!m) continue;
    if (m[1] === 'application/pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m[2] } });
    else if (/^image\/(jpeg|png|webp|gif)$/.test(m[1])) blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
    else return { error: 'Please use photos (JPG/PNG) or PDFs' };
  }
  if ((b.text || '').trim().length > 10) blocks.push({ type: 'text', text: 'Source text:\n' + String(b.text).slice(0, 20000) });
  if (!blocks.length) return { error: 'Add a page or the text first' };
  if (blocks.length > 1) blocks.unshift({ type: 'text', text: `The following ${blocks.length} parts are pages of ONE document — read them together.` });
  return { blocks };
}

export function register(r) {
  r.add('POST', '/ai/recipe', async ({ env, request, data }) => {
    const b = await body(request), c = pages(b);
    if (c.error) return json({ error: c.error }, 400);
    const mats = (await env.DB.prepare('SELECT name, unit FROM materials WHERE active=1 ORDER BY name LIMIT 400').all()).results;
    const cats = (await env.DB.prepare("SELECT name FROM categories WHERE kind='product' AND active=1 ORDER BY sort").all()).results.map(x => x.name);
    const content = [...c.blocks, { type: 'text', text: `Read this recipe for a small South African hair & body products maker.\n\nTheir product categories: ${cats.join(', ') || '(none)'}\n\nTheir inventory items (name — unit):\n${mats.map(x => `- ${x.name} — ${x.unit}`).join('\n') || '(none yet)'}\n\nList every ingredient with its amount for one batch. If amounts are percentages, convert them to grams for the stated batch size (use 500 g if no batch size is given) and set was_percentage. Put "match" only when an inventory item is clearly the same ingredient. Write the method as numbered steps. Use the record_recipe tool.` }];
    try {
      const out = await callTool(env, { feature: 'recipe-capture', user: data.user, content, tool: RECIPE_TOOL,
        system: 'You transcribe cosmetic and soap recipes accurately. Never invent ingredients or amounts; if something is unreadable, leave it out and say so in "uncertain". Keep safety notes (lye, preservatives, essential-oil limits) that appear in the source.' });
      return json(out);
    } catch (e) { return json({ error: e.message }, 502); }
  });


  // Body: { file: dataURL (image or PDF) } or { text }
  r.add('POST', '/ai/invoice', async ({ env, request, data }) => {
    const b = await body(request);
    const c0 = pages(b);
    if (c0.error) return json({ error: c0.error }, 400);
    const content = [...c0.blocks];

    const mats = (await env.DB.prepare('SELECT name, unit FROM materials WHERE active=1 ORDER BY name LIMIT 400').all()).results;
    content.push({ type: 'text', text: `Read this supplier invoice for a small South African cosmetics maker (hair & body products).\n\nTheir current inventory items (name — unit they count it in):\n${mats.map(x => `- ${x.name} — ${x.unit}`).join('\n') || '(none yet)'}\n\nFor each product line, give the total amount bought (convert pack sizes: e.g. "Castor oil 1L × 2" = 2000 ml or 2 l), the line total, and the exact inventory name in "match" only if it is clearly the same product. Ignore VAT breakdowns; put delivery in delivery_fee, not as a line. Use the record_invoice tool.` });
    try {
      const out = await callTool(env, { feature: 'invoice-capture', user: data.user, content, tool: INVOICE_TOOL,
        system: 'You extract structured data from invoices accurately. Never invent lines or numbers; if something is unreadable, leave it out and mention it in notes.' });
      return json(out);
    } catch (e) { return json({ error: e.message }, 502); }
  });

  r.add('GET', '/ai/settings', async ({ env }) => {
    const r0 = await env.DB.prepare("SELECT value FROM settings WHERE key='ai'").first();
    const cur = r0 ? JSON.parse(r0.value) : {};
    return json({ model: MODELS[cur.model] ? cur.model : 'claude-sonnet-5-5', models: MODELS, ready: !!(env.ANTHROPIC_API_KEY || env.AI_MOCK) });
  });
  r.add('PUT', '/ai/settings', async ({ env, request }) => {
    const b = await body(request);
    if (!MODELS[b.model]) return json({ error: 'Unknown model' }, 400);
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('ai', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").bind(JSON.stringify({ model: b.model })).run();
    return json({ ok: true });
  });

  r.add('GET', '/ai/usage', async ({ env }) => {
    const q = sql => env.DB.prepare(sql).first();
    const month = await q(`SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(input_tokens+output_tokens),0) AS tokens FROM ai_usage WHERE substr(created_at,1,7)=substr(datetime('now'),1,7)`);
    const all = await q(`SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd),0) AS cost FROM ai_usage`);
    const recent = (await env.DB.prepare('SELECT created_at, feature, model, input_tokens, output_tokens, cost_usd, user, ok, error FROM ai_usage ORDER BY created_at DESC LIMIT 20').all()).results;
    return json({ month, all, recent, ready: !!(env.ANTHROPIC_API_KEY || env.AI_MOCK) });
  });
}
