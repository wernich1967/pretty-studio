# Changelog

## v0.7.0 — 2026-10-04
- ✨ AI invoice capture (`POST /api/ai/invoice`): photo/PDF/pasted text → Claude (default `claude-sonnet-5-5`, override with env `AI_MODEL`) via forced tool call `record_invoice`; lines matched to inventory, unit-converted, uncertain/new lines flagged; prefilled purchase form for review; captured file attached; optional delivery → Courier expense.
- `lib/ai.js`: key only in Cloudflare secret `ANTHROPIC_API_KEY`; every call logged to `ai_usage` (app, feature, model, tokens, USD cost). `AI_MOCK` env for local testing.
- Database v4: `ai_usage`. Maintenance shows AI usage.
- Remove-test-data now keeps (and makes live) any test supplier/material/product/recipe that real records use.

## v0.6.0 — 2026-10-04
- Database v3: `sales.sale_no`, `sales.channel`, new `expenses` table.
- Sales: multi-product sales (`SYYMMDD-NN`), price from product, stock check, cost snapshot per line, profit; delete puts stock back.
- Expenses (non-stock money out) and Financial: period filter, money in/out, cash left, profit, gross margin, monthly in-vs-out chart (gap months filled, colour-blind-safe pair, hover + table view), top products, expenses list.
- Curing page: countdown/progress, "Ready now".
- Calculators: percentage formula → grams, fragrance load by product type, soap lye (NaOH/KOH).
- Overview: sales this month, curing count, quick links.

## v0.5.0 — 2026-10-04
- Purchases: multi-line purchases, new items/suppliers inline, invoice attachment (photo/PDF → R2, photos shrunk to 1600px), undo guarded against used stock. "Capture invoice (AI)" placeholder for v1.2.
- Suppliers API.
- Recipes: photo, lines linked to materials (or free text), method/notes, estimated batch cost from average purchase cost (g≈ml flagged).
- Make a batch: multiplier, per-line "take from stock" in the material's unit, pick stock items for unlinked lines, stock check, batch number `BYYMMDD-NN`, curing/ready and best-before dates, cost per item, optional product cost update; undo guarded against sold stock.
- Videos page (YouTube embedded).
- Shared `lib/files.js` for R2 uploads.

## v0.4.0 — 2026-10-04
- Database v2: `source` column on all data tables ('live' / 'test').
- Inventory (materials) and Finished products: list, search, category filter, add/edit with opening stock, adjust stock (can't go below zero), history, archive-or-delete. Stock = SUM(stock_movements); avg cost from opening/purchase movements.
- Overview: live totals, low stock, stock value, recent movements.
- Maintenance: backup download, EU Serenity test-data import (purchases → suppliers/materials/purchases/lines/stock; recipes with photos to R2; videos), remove-all-test-data with typed DELETE confirmation, record counts.
- Front-end split into `core.js` + `pages/*.js`.

## v0.3.0 — 2026-10-04
- New app layout (sidebar, all pages listed, mobile menu). Version label above the copyright opens "What's new" (`app/changelog.js`).
- Settings: business details; product & material categories (add, rename, reorder, hide, delete-if-unused).
- API router + middleware: every `/api` call checks the Cloudflare Access login (`lib/auth.js`; full token check activates when ACCESS_TEAM and ACCESS_AUD are set).
- Setup check moved to `/setup.html`.

## v0.2.0 — 2026-10-04
- Setup-check page (`/`) and health API (`/api/health`) to confirm Cloudflare, D1 and R2 are connected.
- Database schema v1: settings, categories, suppliers, materials, products, purchases, recipes, batches, sales, stock movements, files, videos. Applied automatically on first start.
- Starter categories: Hair Oil, Shampoo, Conditioner, Body Wash, Soap, Body Lotion (products); Ingredient, Oil & Butter, Fragrance, Packaging, Labels, Equipment, Other (materials).

## v0.1.0 — 2026-10-04
- Repo set up. Rebranded EU Serenity Studio template to Pretty (logo, sea-glass/blush palette, own storage key, client-specific seed invoices removed). Kept as `reference/`.
