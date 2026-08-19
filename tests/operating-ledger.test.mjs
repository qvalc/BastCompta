import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/operating-ledger.js';

const ledger = globalThis.BastOperatingLedger;
const result = ledger.summarize({
  stock: [{ quantity: 3, unitPrice: 12.5 }, { quantity: '2', unitPrice: '5' }],
  losses: [
    { quantity: 1, unitPrice: 500 },
    { type: 'frais_financiers', quantity: 2, unitPrice: 15 },
    { type: 'charges_exceptionnelles', quantity: 1, unitPrice: 25 },
    { type: 'taxe_communale', quantity: 1, unitPrice: 40 }
  ],
  km: [{ km: 25, trips: 2 }, { km: 10, trips: 0 }],
  privateMovements: [
    { type: 'withdrawal', amount: 100 },
    { type: 'regularization', amount: -20 },
    { type: 'contribution', amount: 50 },
    { type: 'reimbursement', amount: 30 }
  ]
});

assert.equal(result.stockValue, 47.5);
assert.equal(result.lossesTotal, 595);
assert.equal(result.socialContributionsTotal, 500);
assert.equal(result.financialChargesTotal, 30);
assert.equal(result.exceptionalChargesTotal, 25);
assert.equal(result.otherTaxesTotal, 40);
assert.equal(result.kmTotal, 60);
assert.equal(result.withdrawals, 100);
assert.equal(result.regularizations, 20);
assert.equal(result.additions, 80);
assert.equal(result.privateMovementsNet, -40);
assert.equal(ledger.privateMovementEffect({ type: 'withdrawal', amount: -12 }), -12);
assert.equal(ledger.privateMovementEffect({ type: 'contribution', amount: -12 }), 12);
console.log('Stock, charges et mouvements privés valides.');
