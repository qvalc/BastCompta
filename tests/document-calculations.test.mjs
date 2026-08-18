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

assert.deepEqual(calc.structuredCommunication('', '2026', '1'), { base: '', control: '', formatted: '+++...+++' });
assert.equal(calc.structuredCommunication('23', '2026', '7').formatted, '+++123/2026/706+++');
assert.equal(calc.isValidBelgianEnterpriseNumber('BE 0123.456.749'), true);
assert.equal(calc.isValidBelgianEnterpriseNumber('BE 0123.456.748'), false);

console.log('Calculs Devis & Facture valides.');
