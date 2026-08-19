import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/journals.js';
import '../js/modules/accounting/fixed-assets.js';
import '../js/modules/accounting/operating-ledger.js';
import '../js/modules/accounting/vat-declaration.js';
import '../js/modules/accounting/financial-statements.js';
import '../js/modules/accounting/summary.js';

const summary = globalThis.BastAccountingSummary;
const data = {
  settings: {
    vatCarryover: 5,
    ownerAccountCarryover: 100,
    bankBalance: 500,
    cashBalance: 50,
    capitalStart: 1000,
    retainedEarnings: 200,
    socialExemptionThreshold: 1881.76,
    socialContributionRate: 20.5,
    socialContributionFeeRate: 3.5
  },
  sales: [{ tvac: 1210, rate: 21 }],
  purchases: [{ supplier: 'A', invoiceNumber: '1', htva: 100, rate: 21, deductible: true, category: 'marchandise' }],
  investments: [{ date: '2026-01-15', amount: 1200, durationMonths: 12 }],
  assets: [{ date: '2026-03-01', amount: 1200, durationMonths: 12 }],
  stock: [{ quantity: 2, unitPrice: 50 }],
  losses: [{ type: 'taxe_communale', quantity: 1, unitPrice: 25 }],
  km: [{ km: 10, trips: 2 }],
  privateMovements: [{ type: 'withdrawal', amount: 40 }]
};
const result = summary.summarize({
  data,
  currentYear: 2026,
  vatLedger: { rows: [{ computed: { creditAmount: 7 } }], totalDueOpen: 30 }
});

assert.equal(result.salesNet, 1000);
assert.equal(result.salesVat, 210);
assert.equal(result.purchasesNet, 100);
assert.equal(result.purchasesVat, 21);
assert.equal(result.yearlyAmort, 1100);
assert.equal(result.assetsGross, 1200);
assert.equal(result.totalAmortized, 900);
assert.equal(result.stockValue, 100);
assert.equal(result.otherTaxesTotal, 25);
assert.equal(result.kmTotal, 20);
assert.equal(result.ownerAccountBalance, 60);
assert.equal(result.receivableVat, 7);
assert.equal(result.payableVat, 30);
assert.equal(result.netVat, 184);
assert.equal(result.realVat, 23);

const exempt = summary.summarize({ data, currentYear: 2026, vatExempt: true, isPurchaseVatRecoverable: () => false });
assert.equal(exempt.salesVat, 0);
assert.equal(exempt.purchasesVat, 0);
assert.equal(exempt.receivableVat, 0);
assert.equal(exempt.payableVat, 0);
assert.equal(exempt.netVat, 0);
console.log('Synthèse comptable complète valide.');
