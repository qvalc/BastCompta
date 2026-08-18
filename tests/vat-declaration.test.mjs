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
console.log('Déclarations TVA valides.');
