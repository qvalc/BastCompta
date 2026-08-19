import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/vat-declaration.js';
const vat = globalThis.BastVatDeclaration;
const result = vat.compute({ declaration: { manualBoxes: {} }, sales: [
  { tvac: 121, rate: 21 }, { tvac: 106, rate: 6 }
], purchases: [{ htva: 50, category: 'marchandise' }, { htva: 25, category: 'frais_generaux' }],
investments: [{ amount: 100, rate: 21 }], deductiblePurchaseVat: 10, previousCredit: 5 });
assert.equal(result.boxes['01'], 100); assert.equal(result.boxes['03'], 100); assert.equal(result.boxes['54'], 27);
assert.equal(result.boxes['59'], 31); assert.equal(result.boxes['81'], 50); assert.equal(result.boxes['82'], 25); assert.equal(result.boxes['83'], 100);
assert.equal(result.creditAmount, 9); assert.equal(result.dueAmount, 0);
const declarations = [{ filed: false, paymentAmount: 0 }, { filed: true, paymentAmount: 5 }];
const ledger = vat.ledger(declarations, 0, (declaration, credit) => ({ dueAmount: declaration.filed ? 10 : 20, creditAmount: credit }));
assert.equal(ledger.totalDueOpen, 25); assert.equal(ledger.totalUnfiledDue, 20); assert.equal(ledger.totalFiledUnpaid, 5);
const position = vat.openPosition({ vatLedger: { rows: [
  { computed: { creditAmount: 15 } }, { computed: { creditAmount: 8 } }
], totalDueOpen: 12.345 }, initialCredit: 20, salesVat: 100, purchasesVat: 30 });
assert.deepEqual(position, { netVat: 50, openVatCredit: 8, openVatDue: 12.35, realVat: 4.35 });
assert.deepEqual(vat.openPosition({ initialCredit: 25, salesVat: 100, purchasesVat: 20 }), {
  netVat: 55, openVatCredit: 25, openVatDue: 0, realVat: -25
});
assert.deepEqual(vat.openPosition({ vatLedger: { totalDueOpen: 100 }, vatExempt: true }), {
  netVat: 0, openVatCredit: 0, openVatDue: 0, realVat: 0
});
console.log('Déclarations TVA valides.');
