import assert from 'node:assert/strict';
import '../js/modules/clients/project-finance.js';
const finance = globalThis.BastProjectFinance;
assert.equal(finance.itemYear({ date: '2026-08-18' }), '2026');
assert.equal(finance.itemYear({ createdAt: '18/08/2025' }), '2025');
const project = { linkedInvoices: [
  { date: '2026-01-01', clientHtva: 1000, workHtva: 700, suppliesSaleHtva: 300, suppliesCostHtva: 180 },
  { date: '2025-01-01', clientHtva: 500, suppliesHtva: 100 }
], costs: [{ date: '2026-02-01', amount: 120 }] };
const totals = finance.totals(project, '2026');
assert.equal(totals.invoices, 1000); assert.equal(totals.manualCosts, 120); assert.equal(totals.invoiceSupplyCosts, 180);
assert.equal(totals.costs, 300); assert.equal(totals.margin, 700); assert.equal(totals.marginRate, 70);
assert.equal(totals.invoiceWorkTotal, 700); assert.equal(totals.invoiceSupplySales, 300);
console.log('Finances des suivis clients valides.');
