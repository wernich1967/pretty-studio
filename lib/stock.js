import { uid } from './util.js';
// Every stock change is a row in stock_movements. Stock on hand = SUM(qty).
export function movement(db, m) {
  return db.prepare(`INSERT INTO stock_movements (id, date, item_type, item_id, qty, unit_cost, reason, ref_type, ref_id, batch_no, note, created_by, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid(), m.date || new Date().toISOString().slice(0, 10), m.item_type, m.item_id, Number(m.qty) || 0,
    Number(m.unit_cost) || 0, m.reason, m.ref_type || null, m.ref_id || null, m.batch_no || null, m.note || null, m.created_by || null, m.source || 'live');
}
export const UNITS = ['g', 'kg', 'ml', 'l', 'each', 'pack'];
