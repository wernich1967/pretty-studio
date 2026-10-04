# Pretty Studio

Stock, recipe, batch and sales management for **Pretty** (hair & body products).
Built and maintained by George (Everything Unique Creations).

## Architecture
| Layer | Service |
|---|---|
| Code & versions | GitHub (private) — this repo |
| Hosting | Cloudflare Pages (auto-deploys on push to `main`) |
| Login | Cloudflare Access (approved emails only) |
| API | Cloudflare Pages Functions (`functions/api`) |
| Database | Cloudflare D1 (schema in `lib/migrations.js`, applied automatically) |
| Files (photos, invoices) | Cloudflare R2 |
| AI (v1.2) | Shared AI relay Worker with per-app usage tracking |

## Folders
- `app/` — the front-end the user sees
- `functions/api/` — server API between the app and D1/R2
- `lib/` — shared server code: `migrations.js` (database schema — never edit a released migration, add a new one), `db.js`, `version.js`
- `reference/` — the v0 standalone build (rebranded EU Serenity template)
- `docs/` — plan and notes

## Release rules
1. Bump the version in the app (shown bottom-left, above the copyright).
2. Add an entry to `CHANGELOG.md`.
3. Schema changes go in a new migration file.

## Cloudflare Pages settings
- Build command: *(none)*
- Build output directory: `app`
- Bindings: D1 `DB` → `pretty-db`, R2 `FILES` → `pretty-files`
