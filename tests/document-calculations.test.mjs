import assert from 'node:assert/strict';
import '../js/modules/documents/calculations.js';

const calc = globalThis.BastDocumentCalculations;
const row = { qty: 2, unitPrice: 100, discount: 10, vatRate: 21, costPrice: 55 };

assert.equal(calc.lineBase(row), 200);
assert.equal(calc.lineDiscountAmount(row), 20);
assert.equal(calc.lineNet(row), 180);
assert.equal(calc.lineVat(row), 37.8);
assert.equal(calc.lineTvac(row), 217.8);
assert.equal(calc.lineCost(row), 110);
assert.equal(calc.lineSupplyMargin(row), 70);

const totals = calc.totalsForDocument({ lines: [row], suppliesEnabled: true, suppliesLines: [{ qty: 1, unitPrice: 50, vatRate: 6, costPrice: 30 }] });
assert.equal(totals.htva, 230);
assert.equal(totals.vat, 40.8);
assert.equal(totals.tvac, 270.8);
assert.equal(totals.suppliesCostHtva, 30);

assert.equal(calc.invoiceStatus(100, 0), 'unpaid');
assert.equal(calc.invoiceStatus(100, 40), 'partial');
assert.equal(calc.invoiceStatus(100, 100), 'paid');
assert.equal(calc.invoiceStatus(100, 110), 'overpaid');
assert.equal(calc.invoiceStatus(-100, 0), 'credit_note');
assert.equal(calc.paymentBalance(121, 20), 101);

const accountingPayload = calc.invoiceAccountingPayload({
  date: '2026-08-19',
  clientName: 'Client test',
  documentNumber: 'F-2026-010',
  lines: [
    { description: 'Travaux', qty: 1, unitPrice: 100, vatRate: 21 },
    { description: 'Autre taux', qty: 1, unitPrice: 50, vatRate: 6 }
  ]
}, 'unpaid');
assert.equal(accountingPayload.action, 'upsert');
assert.equal(accountingPayload.rows.length, 2);
assert.deepEqual(accountingPayload.rows.map(item => [item.rate, item.tvac]), [[21, 121], [6, 53]]);

const creditPayload = calc.invoiceAccountingPayload({
  documentNumber: 'NC-2026-001',
  linkedInvoiceNumber: 'F-2026-010',
  lines: [{ description: 'Correction', qty: -1, unitPrice: 100, vatRate: 21 }]
}, 'credit_note');
assert.equal(creditPayload.documentType, 'credit_note');
assert.equal(creditPayload.rows[0].tvac, -121);
assert.equal(creditPayload.rows[0].description, 'Note de crédit liée à F-2026-010');
assert.deepEqual(calc.invoiceAccountingPayload({ lines: [] }), {
  rows: [],
  message: 'La facture ne contient aucune ligne.'
});

assert.deepEqual(calc.structuredCommunication('', '2026', '1'), { base: '', control: '', formatted: '+++...+++' });
assert.equal(calc.structuredCommunication('23', '2026', '7').formatted, '+++123/2026/706+++');
assert.equal(calc.isValidBelgianEnterpriseNumber('BE 0123.456.749'), true);
assert.equal(calc.isValidBelgianEnterpriseNumber('BE 0123.456.748'), false);

console.log('Calculs de la Gestion commerciale valides.');
