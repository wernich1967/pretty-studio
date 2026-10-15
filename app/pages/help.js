// Help: short how-tos per area of the studio, searchable, plus quick routes to the tour, the AI and the setup guide.
import { esc, $, icon } from '../core.js';
import { startTour, MAIN_TOUR } from '../tour.js';
import { openAsk } from '../ask.js';

// [group, icon, [[question, answer-html], …]]
const TOPICS = [
  ['Start here', 'overview', [
    ['How the studio works', `Everything follows the way you work: <b>Buy → Make → Sell</b>.<ul><li>A <b>purchase</b> adds ingredients and supplies to your stock.</li><li>A <b>batch</b> takes ingredients out of stock and adds finished products.</li><li>A <b>sale</b> takes finished products out.</li></ul>Your stock and costs are always worked out from these records, so keep recording and the numbers stay right.`],
    ['The Getting started guide', `Seven short steps: your details and colours, categories, opening stock, then your first recipe, batch and sale. Open it from the menu (<b>Getting started</b>, or the ✦ icon at the bottom once you've finished). You can hide it from the Overview any time.`],
    ['Bringing in your existing stock list', `In <b>Getting started → Opening stock</b>, drop in an Excel or CSV file. Check which column is which, preview, then import. New categories are added for you and items already in the studio are skipped. No spreadsheet? Download the ready-made template, fill it in and drop it back in.`],
    ['The ＋ New button', `The quickest way to record anything — a purchase, an invoice capture, a batch, a sale, an expense, a recipe or a new ingredient — from any page. On a phone it's the round ＋ in the bottom bar.`]
  ]],
  ['Buy', 'purchases', [
    ['Recording a purchase', `<b>Purchases → + Record a purchase</b>. Choose the supplier, add the invoice number and date, then one line per item: the item, how much you bought (in the unit you count it in) and what you paid for that line. New items and suppliers can be added right there. Use <b>📎 Attach invoice</b> to keep a photo or PDF. When you save, the stock goes up.`],
    ['Capturing an invoice with AI', `Click the <b>✨ button</b> (bottom right) → <b>Capture an invoice</b>, or <b>✨ Capture invoice (AI)</b> on Purchases. Take a photo, choose a PDF or paste the text — up to 8 pages. The AI fills in the purchase and matches lines to your stock items; <b>check every line before saving</b>. Delivery can be recorded as a Courier expense.`],
    ['VAT on invoices', `You are not VAT-registered, so VAT is part of what things cost you. Line totals should <b>include</b> VAT. If the lines don't add up to the invoice total, you'll see a warning before saving — usually it means VAT was left off.`],
    ['"This looks like a duplicate"', `The studio warns you when an invoice with the same number and supplier (or the same supplier, date and total) is already recorded. If it really is a different invoice, choose <b>It's a different invoice — save anyway</b>.`],
    ['Deleting a purchase', `Open the purchase and choose <b>Delete purchase</b>. Its stock comes off again — this only works while that stock hasn't been used in a batch yet.`],
    ['Suppliers', `<b>Suppliers</b> shows contact details, how often you've bought from each and what you've spent. A supplier with purchases is archived instead of deleted, so your history stays complete.`]
  ]],
  ['Make', 'recipes', [
    ['Adding a recipe', `<b>Recipes → + New recipe</b>. Add each ingredient, linked to the matching stock item so batches can take it out of stock, plus the method, notes and a photo. The studio estimates the batch cost from what you actually paid on average. Grams and millilitres are treated as equal for oils and liquids — this is flagged where it applies.`],
    ['Capturing a recipe with AI', `<b>✨ button → Capture a recipe</b>, or <b>✨ Capture recipe (AI)</b> on Recipes. Use a photo of a recipe card, a PDF or pasted text. Percentages are converted to grams, and you'll be warned if a recipe with the same or a very similar name already exists.`],
    ['Making a batch', `<b>Batches → + Make a batch</b> (or <b>Make a batch</b> on a recipe). Choose the recipe and how many batches; the studio checks your stock. When you record it, the ingredients come out of stock, the finished products go in, and you get a batch number like B261015-01, plus curing and best-before dates and the cost per item.`],
    ['Curing', `Batches that are still curing show at the top of <b>Batches</b> with a countdown, and the menu shows how many are curing.`],
    ['Undoing a batch', `Open the batch and choose <b>Undo batch</b>: ingredients go back into stock and the finished products come off. This isn't possible once products from that batch have been sold.`]
  ]],
  ['Sell', 'sales', [
    ['Recording a sale', `<b>Sales → + Record a sale</b>. Add one or more products — prices fill in from the product, stock is checked, and the profit on the sale is worked out. <b>Sold via</b> lets you note Market, Instagram, Website and so on.`],
    ['Deleting a sale', `Open the sale and choose <b>Delete sale</b> — the products go back into stock.`]
  ]],
  ['Stock', 'inventory', [
    ['Ingredients & supplies vs finished products', `<b>Ingredients & supplies</b> is what you buy (oils, butters, fragrance, bottles, labels…), counted in the unit you choose (g, kg, ml, l, each, pack). <b>Finished products</b> is what you make and sell, counted per item, with cost to make and selling price.`],
    ['Low stock', `Set <b>Reorder when stock reaches</b> on an item. When stock drops to that level it's marked low, and the menu shows how many items are running low.`],
    ['Correcting stock', `Open the item and use <b>Adjust stock</b> — for a stock count, a spill or something given away. Use a minus to take stock off. Stock can't go below zero. Every change is kept in the item's history.`],
    ['Deleting an item', `Items with history (purchases, batches, sales) are archived instead of deleted, so past records stay correct.`]
  ]],
  ['Money', 'financial', [
    ['The Financial page', `Money in, money out, profit and gross margin for the period you choose, a month-by-month chart and your best products by profit. No VAT is added anywhere.`],
    ['Other expenses', `Costs that aren't stock — courier, market fees, printing — go under <b>Financial → Other expenses</b> (or <b>＋ New → Add an expense</b>), so your profit is real.`]
  ]],
  ['AI', 'ai', [
    ['Asking a question', `Click the <b>✨ button → Ask a question</b> and type in plain English: “Do I have coconut oil in stock?”, “What is running low?”, “Can I make two batches of Rose Hair Oil?”, “What did I sell last month?”. Answers come from your own records and show what was checked. The assistant can only look — it never records, changes or deletes anything.`],
    ['What the AI costs', `Every AI use costs a little: about R0.05–R0.20 for a question and R0.20–R0.40 for a capture. Today's and the total cost show at the top right of the Overview. In <b>Settings → AI invoice reading</b> you can choose Sonnet (most accurate) or Haiku (about half the cost).`],
    ['Your data and the AI', `To answer, the studio sends the relevant records or the document you captured to Anthropic's Claude AI. The AI key stays on the server — never in your browser.`]
  ]],
  ['Tools', 'calculators', [
    ['Calculators', `Percentage formula → grams, fragrance amount by product type, and a soap lye calculator (NaOH or KOH, with superfat and water).`],
    ['Videos', `Save the YouTube how-to videos you use, so they're all in one place.`]
  ]],
  ['Settings & data', 'settings', [
    ['Studio colours', `<b>Settings → Studio colours</b>: Sage & kraft, Sea glass or Rose clay. It changes straight away on every device that signs in.`],
    ['Categories and business details', `In <b>Settings</b>: your business name and contact details, and the product and material categories — add, rename, reorder or hide them. A category in use is hidden instead of deleted.`],
    ['Backups', `Cloudflare backs up your data automatically. You can also download everything as one file from <b>Maintenance → Download backup</b> (owner only) — once a month is a good habit.`],
    ['Using it on your phone', `The bar at the bottom has Home, Stock, ＋ New, Sales and the menu. The ✨ AI button sits just above it.`],
    ["What's new", `Click the version label at the bottom of the menu to see what changed in each update.`]
  ]],
  ['Questions people ask', 'help', [
    ["My stock didn't go up after a purchase", `Check that each purchase line is linked to a stock item (not just typed as a description) and that the quantity is in that item's unit — for example 2 000 ml, not 2 bottles.`],
    ['A stock figure looks wrong', `Open the item and look at its history to see every purchase, batch, sale and adjustment. If your shelf count is different, use <b>Adjust stock</b> to correct it.`],
    ['Can someone else use the studio?', `Yes — anyone whose email address is approved for the studio's login. Ask George to add them.`],
    ['Something is broken or confusing', `Note what you clicked and what you saw (a screenshot helps) and send it to George.`]
  ]]
];

export function render() {
  return `<div class="head"><div><h1>Help</h1><div class="sub">Short answers for every part of the studio.</div></div></div>
  <div class="hquick">
    <button class="card hq" id="hTour"><span class="cic">${icon('overview')}</span><span><b>Take the tour</b><span class="note">A one-minute walk around the menu</span></span></button>
    <button class="card hq" id="hAsk"><span class="cic warm">${icon('ai')}</span><span><b>Ask a question</b><span class="note">“Do I have shea butter in stock?”</span></span></button>
    <a class="card hq" href="#/setup"><span class="cic">${icon('setup')}</span><span><b>Getting started guide</b><span class="note">Set up the studio step by step</span></span></a>
  </div>
  <div class="card"><input id="hSearch" type="search" placeholder="Search help — e.g. VAT, batch, low stock" autocomplete="off" aria-label="Search help">
    <div id="hList">${TOPICS.map(([g, ic, items]) => `<section class="hgroup"><h2><span class="cic">${icon(ic)}</span>${esc(g)}</h2>
      ${items.map(([q, a]) => `<details class="hitem"><summary>${esc(q)}</summary><div class="hans">${a}</div></details>`).join('')}</section>`).join('')}</div>
    <div class="empty" id="hNone" hidden>Nothing found. Try another word — or ask the ✨ assistant.</div></div>`;
}

export async function after() {
  $('#hTour').onclick = () => startTour(MAIN_TOUR);
  $('#hAsk').onclick = () => openAsk();
  const search = $('#hSearch');
  search.oninput = () => {
    const w = search.value.trim().toLowerCase();
    let any = false;
    document.querySelectorAll('.hgroup').forEach(g => {
      let n = 0;
      g.querySelectorAll('.hitem').forEach(d => { const hit = !w || d.textContent.toLowerCase().includes(w); d.hidden = !hit; d.open = !!w && hit; if (hit) n++; });
      g.hidden = !n; if (n) any = true;
    });
    $('#hNone').hidden = any;
  };
}
