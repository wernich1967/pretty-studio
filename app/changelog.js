// Shown in the app under "What's new" (click the version label). Newest first.
export const CHANGELOG = [
  { version: '0.8.0', date: '2026-10-04', items: [
    '✨ Capture recipe: drop a photo of a recipe card, a PDF, or paste a recipe — the AI fills in ingredients (linked to your inventory), amounts, method and notes for you to check.',
    'Recipes in percentages are converted to grams for the batch size.',
    'The captured photo becomes the recipe picture.',
    'Duplicate check for recipes — warns if you already have a recipe with the same or a very similar name.'
  ]},
  { version: '0.7.0', date: '2026-10-04', items: [
    '✨ Capture invoice: take a photo, upload a PDF or paste the text of a supplier invoice — the AI fills in the purchase, matches lines to your inventory, and you check it before saving.',
    'Lines the AI is unsure about are highlighted, and new items are suggested with a category.',
    'The captured invoice is attached to the purchase automatically.',
    'Maintenance shows AI usage — calls and cost per month.',
    'Settings: choose the AI model — Sonnet (most accurate) or Haiku (cheapest).',
    'Duplicate check: warns if an invoice was already recorded (same invoice number from the same supplier, or same supplier, date and total) — before you save.',
    'Capture invoice: drag & drop a file, or press Ctrl+V to paste a screenshot. On a phone you can pick camera or gallery.'
  ]},
  { version: '0.6.0', date: '2026-10-04', items: [
    'Sales: record sales with several products, prices fill in from the product, stock goes down and profit is worked out per sale.',
    'Financial: money in vs money out by month, cash left, profit, gross margin and best products — for this month, last month, this year or all time.',
    'Other expenses (courier, market fees, printing…) so profit is real.',
    'Curing: batches that need time, with a countdown and a “Ready now” button.',
    'Calculators: percentage formula → grams, fragrance amount per product type, and the soap lye calculator.'
  ]},
  { version: '0.5.0', date: '2026-10-04', items: [
    'Purchases: record what you buy (several items per invoice), attach the invoice photo or PDF — stock goes up automatically.',
    'New items and suppliers can be added straight from a purchase.',
    'Recipes: photos, ingredients linked to inventory, method & notes, and the estimated cost per batch from what you actually paid.',
    'Make a batch: takes ingredients out of stock, adds finished products, gives each batch a number, curing and best-before dates, and works out the cost per item.',
    'Undo a purchase or batch safely — it refuses if that stock has already been used or sold.',
    'Videos: save tutorial links (YouTube plays right inside the studio), grouped by topic.',
    'The ✨ Capture invoice (AI) button is in place, ready for version 1.2.'
  ]},
  { version: '0.4.0', date: '2026-10-04', items: [
    'Inventory: ingredients, packaging and supplies with opening stock, reorder levels, average cost and full stock history.',
    'Finished products: stock, cost to make, selling price, product code and stock value.',
    'Adjust stock with a reason — every change is kept in the item\'s history.',
    'Overview shows live totals, low stock and recent stock changes.',
    'Maintenance: download a backup, load test data and remove it again.'
  ]},
  { version: '0.3.0', date: '2026-10-04', items: [
    'New Pretty Studio layout with all pages in the menu.',
    'Settings: business details and your own product & material categories — add, rename, reorder and hide.',
    'Version label and this What\'s new panel.',
    'Extra login check on every save.'
  ]},
  { version: '0.2.0', date: '2026-10-04', items: ['Cloud database, file storage and secure email-code login set up.'] },
  { version: '0.1.0', date: '2026-10-04', items: ['Pretty branding and colours.'] }
];
