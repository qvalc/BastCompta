import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/financial-statements.js';
const result = globalThis.BastFinancialStatements.summarize({ salesNet: 10000, purchasesNet: 3000, yearlyAmort: 1000,
  otherTaxesTotal: 200, financialChargesTotal: 100, exceptionalChargesTotal: 50, socialContributionsTotal: 500,
  assetsGross: 5000, totalAmortized: 1500, stockValue: 1000, privateMovements: [
    { type: 'withdrawal', amount: 300 }, { type: 'contribution', amount: 100 }
  ], ownerAccountCarryover: 500, bankBalance: 2000, cashBalance: 100, capitalStart: 1000,
  retainedEarnings: 400, openVatCredit: 200, openVatDue: 0 });
assert.equal(result.totalCharges, 4350); assert.equal(result.estimatedProfit, 5650);
assert.equal(result.privateMovementsNet, -200); assert.equal(result.ownerAccountBalance, 300);
assert.equal(result.netFixedAssets, 3500); assert.equal(result.assetsSide, 6800);
assert.equal(result.liabilitiesSide, 7350); assert.equal(result.realVat, -200);
assert.ok(result.socialContributionDue > 0);
console.log('États comptables valides.');
