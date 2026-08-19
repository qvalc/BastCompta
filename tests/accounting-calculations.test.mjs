import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
const calc = globalThis.BastAccountingCalculations;
assert.equal(calc.netFromTvac(121, 21), 100);
assert.equal(calc.vatFromTvac(121, 21), 21);
assert.equal(calc.tvacFromHtva(100, 6), 106);
assert.equal(calc.signedSalesTvac({ tvac: 121, documentType: 'credit_note' }), -121);
assert.equal(calc.salesNet({ tvac: 121, rate: 21 }), 100);
assert.equal(calc.salesVat({ tvac: 121, rate: 21 }, true), 0);
assert.equal(calc.purchaseProfessionalCost({ htva: 100, rate: 21 }, false), 121);
assert.equal(calc.allocatedPurchaseVat([{ htva: 100, rate: 21, deductible: true }], 0), 21);
assert.equal(calc.allocatedPurchaseVat([{ htva: 100, rate: 21, deductible: false }], 0), 0);

const splitPurchase = [
  { supplier: 'Fournisseur', invoiceNumber: 'A-1', htva: 0.01, rate: 21, deductible: true },
  { supplier: 'Fournisseur', invoiceNumber: 'A-1', htva: 0.01, rate: 21, deductible: true },
  { supplier: 'Fournisseur', invoiceNumber: 'A-1', htva: 0.01, rate: 21, deductible: true }
];
assert.deepEqual(splitPurchase.map((_, index) => calc.allocatedPurchaseVat(splitPurchase, index)), [0, 0, 0.01]);
assert.equal(splitPurchase.reduce((sum, _, index) => sum + calc.allocatedPurchaseVat(splitPurchase, index), 0), 0.01);

const isolatedPurchases = [
  { supplier: 'A', invoiceNumber: 'INV-1', htva: 10, rate: 21, deductible: true },
  { supplier: 'B', invoiceNumber: 'INV-1', htva: 10, rate: 21, deductible: true },
  { supplier: 'A', invoiceNumber: 'INV-1', htva: 10, rate: 6, deductible: true }
];
assert.deepEqual(isolatedPurchases.map((_, index) => calc.allocatedPurchaseVat(isolatedPurchases, index)), [2.1, 2.1, 0.6]);
const amort = calc.amortization(1200, '2026-01-15', 12, 2026);
assert.equal(amort.monthlyAmort, 100); assert.equal(amort.amortYear, 1100); assert.equal(amort.netValue, 100);
assert.deepEqual(calc.amortization(1200, '', 12, 2026), { amortYear: 0, amortTotal: 0, netValue: 1200, monthlyAmort: 100 });
console.log('Calculs comptables valides.');
