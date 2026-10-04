import { json } from '../db.js';
import { body } from '../util.js';
import { callTool } from '../ai.js';

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

export function register(r) {
  // Body: { file: dataURL (image or PDF) } or { text }
  r.add('POST', '/ai/invoice', async ({ env, request, data }) => {
    const b = await body(request);
    const content = [];
    const m = /^data:([^;]+);base64,(.*)$/.exec(b.file || '');
    if (m) {
      if (m[1] === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m[2] } });
      else if (/^image\/(jpeg|png|webp|gif)$/.test(m[1])) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
      else return json({ error: 'Please use a photo (JPG/PNG) or a PDF' }, 400);
    } else if ((b.text || '').trim().length > 10) content.push({ type: 'text', text: 'Invoice text:\n' + String(b.text).slice(0, 20000) });
    else return json({ error: 'Add a photo, PDF or the invoice text first' }, 400);

    const mats = (await env.DB.prepare('SELECT name, unit FROM materials WHERE active=1 ORDER BY name LIMIT 400').all()).results;
    content.push({ type: 'text', text: `Read this supplier invoice for a small South African cosmetics maker (hair & body products).\n\nTheir current inventory items (name — unit they count it in):\n${mats.map(x => `- ${x.name} — ${x.unit}`).join('\n') || '(none yet)'}\n\nFor each product line, give the total amount bought (convert pack sizes: e.g. "Castor oil 1L × 2" = 2000 ml or 2 l), the line total, and the exact inventory name in "match" only if it is clearly the same product. Ignore VAT breakdowns; put delivery in delivery_fee, not as a line. Use the record_invoice tool.` });
    try {
      const out = await callTool(env, { feature: 'invoice-capture', user: data.user, content, tool: INVOICE_TOOL,
        system: 'You extract structured data from invoices accurately. Never invent lines or numbers; if something is unreadable, leave it out and mention it in notes.' });
      return json(out);
    } catch (e) { return json({ error: e.message }, 502); }
  });

  r.add('GET', '/ai/usage', async ({ env }) => {
    const q = sql => env.DB.prepare(sql).first();
    const month = await q(`SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(input_tokens+output_tokens),0) AS tokens FROM ai_usage WHERE substr(created_at,1,7)=substr(datetime('now'),1,7)`);
    const all = await q(`SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd),0) AS cost FROM ai_usage`);
    const recent = (await env.DB.prepare('SELECT created_at, feature, model, input_tokens, output_tokens, cost_usd, user, ok, error FROM ai_usage ORDER BY created_at DESC LIMIT 20').all()).results;
    return json({ month, all, recent, ready: !!(env.ANTHROPIC_API_KEY || env.AI_MOCK) });
  });
}
