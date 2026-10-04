# Changelog

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
