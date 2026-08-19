import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/sales-import.js';

const salesImport = globalThis.BastSalesImport;
const credit = salesImport.normalizeRow({
  date: '2026-08-19', client: 'Client', invoiceNumber: 'NC-1', documentType: 'credit_note', tvac: 121.009, rate: 21
});
assert.equal(credit.tvac, -121.01);
assert.equal(salesImport.typeLabel(credit), 'Note de crédit');
assert.equal(salesImport.typeLabel({ documentType: 'invoice' }), 'Facture');

const plan = salesImport.prepare({
  action: 'upsert',
  invoiceNumber: 'F-2',
  rows: [
    { date: '2026-08-19', client: 'Nouveau', invoiceNumber: 'F-2', tvac: 121, rate: 21 },
    { date: '2026-08-18', invoiceNumber: 'F-2', description: 'Seconde ligne', tvac: 0 },
    {}
  ]
});
assert.deepEqual(plan.invoiceNumbers, ['F-2']);
assert.equal(plan.incomingRows.length, 2);
const applied = salesImport.apply([
  { date: '2026-01-01', client: 'Ancien', invoiceNumber: 'F-2', tvac: 100 },
  { date: '2026-09-01', client: 'Conservé', invoiceNumber: 'F-3', tvac: 50 }
], plan);
assert.equal(applied.count, 2);
assert.deepEqual(applied.sales.map(row => row.client || row.description), ['Conservé', 'Nouveau', 'Seconde ligne']);
assert.equal(salesImport.matchingRows(applied.sales, ['F-2']).length, 2);

const cancelled = salesImport.apply(applied.sales, salesImport.prepare({ action: 'cancel', invoiceNumber: 'F-2' }));
assert.equal(cancelled.count, 2);
assert.deepEqual(cancelled.sales.map(row => row.invoiceNumber), ['F-3']);
assert.match(cancelled.message, /2 ligne\(s\) retirée/);
console.log('Import des ventes valide.');
