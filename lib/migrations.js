// Database schema, applied automatically by the app (see lib/db.js).
// RULE: never edit a migration once it has been released — add a new one.
export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial schema',
    sql: [
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')))`,
      // kind: 'product' (finished goods) or 'material' (ingredients, packaging, supplies)
      `CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT, phone TEXT, email TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT, category_id TEXT, unit TEXT NOT NULL DEFAULT 'g', reorder_level REAL DEFAULT 0, avg_cost REAL DEFAULT 0, image_key TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT, category_id TEXT, size REAL, size_unit TEXT, unit_cost REAL DEFAULT 0, selling_price REAL DEFAULT 0, reorder_level REAL DEFAULT 0, description TEXT, image_key TEXT, rating INTEGER, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, supplier_id TEXT, invoice_no TEXT, date TEXT NOT NULL, total REAL DEFAULT 0, file_key TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS purchase_lines (id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, material_id TEXT, description TEXT, qty REAL NOT NULL, unit TEXT, line_total REAL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, name TEXT NOT NULL, category_id TEXT, product_id TEXT, yield_qty REAL, yield_unit TEXT, method TEXT, notes TEXT, image_key TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS recipe_lines (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, material_id TEXT, description TEXT, qty REAL NOT NULL, unit TEXT, sort INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, batch_no TEXT NOT NULL, recipe_id TEXT, product_id TEXT, date TEXT NOT NULL, qty_made REAL DEFAULT 0, cost_total REAL DEFAULT 0, ready_date TEXT, best_before TEXT, status TEXT DEFAULT 'done', notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, date TEXT NOT NULL, product_id TEXT NOT NULL, qty REAL NOT NULL, unit_price REAL DEFAULT 0, unit_cost REAL DEFAULT 0, customer TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
      // Every stock change is one row. Stock on hand = SUM(qty) per item.
      // reason: opening | purchase | batch_use | batch_output | sale | adjustment
      `CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY, date TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL, qty REAL NOT NULL, unit_cost REAL DEFAULT 0, reason TEXT NOT NULL, ref_type TEXT, ref_id TEXT, batch_no TEXT, note TEXT, created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE INDEX IF NOT EXISTS idx_moves_item ON stock_movements(item_type, item_id)`,
      `CREATE INDEX IF NOT EXISTS idx_moves_ref ON stock_movements(ref_type, ref_id)`,
      `CREATE TABLE IF NOT EXISTS files (key TEXT PRIMARY KEY, kind TEXT, name TEXT, mime TEXT, size INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT, category TEXT, created_at TEXT DEFAULT (datetime('now')))`,
      // Starter categories — Sian can rename/add/remove these in Settings.
      `INSERT OR IGNORE INTO categories (id, kind, name, sort) VALUES
        ('pc-hair-oil','product','Hair Oil',1),('pc-shampoo','product','Shampoo',2),('pc-conditioner','product','Conditioner',3),
        ('pc-body-wash','product','Body Wash',4),('pc-soap','product','Soap',5),('pc-lotion','product','Body Lotion',6),
        ('mc-ingredient','material','Ingredient',1),('mc-oil','material','Oil & Butter',2),('mc-fragrance','material','Fragrance & Essential Oil',3),
        ('mc-packaging','material','Packaging',4),('mc-label','material','Labels',5),('mc-equipment','material','Equipment & Tools',6),('mc-other','material','Other supply',7)`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('business', '{"name":"Pretty","currency":"ZAR","vat":false}')`
    ]
  },
  {
    version: 2,
    name: 'source tag for test data',
    // source = 'live' for real data, 'test' for imported test data (removable in Maintenance)
    sql: ['suppliers','materials','products','purchases','purchase_lines','recipes','recipe_lines','batches','sales','stock_movements','files','videos']
      .map(t => `ALTER TABLE ${t} ADD COLUMN source TEXT DEFAULT 'live'`)
  },
  {
    version: 3,
    name: 'sale numbers and expenses',
    sql: [
      `ALTER TABLE sales ADD COLUMN sale_no TEXT`,
      `ALTER TABLE sales ADD COLUMN channel TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_sales_no ON sales(sale_no)`,
      `CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, date TEXT NOT NULL, category TEXT, description TEXT, amount REAL NOT NULL DEFAULT 0, source TEXT DEFAULT 'live', created_at TEXT DEFAULT (datetime('now')))`
    ]
  },
  {
    version: 4,
    name: 'AI usage log',
    sql: [
      // One row per AI call — app + feature so usage can be tracked across George's apps
      `CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now')), app TEXT, feature TEXT, model TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, user TEXT, ok INTEGER DEFAULT 1, error TEXT)`
    ]
  }
];
