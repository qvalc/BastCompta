import assert from 'node:assert/strict';
import '../js/modules/taxes/calculations.js';
const tax = globalThis.BastTaxCalculations;
const amort = tax.amortization(1200, '2026-01-15', 12, 2026);
assert.equal(amort.amortYear, 1100); assert.equal(amort.netValue, 100);
assert.equal(tax.estimatedSocialContribution(1000, {}), 0);
assert.equal(tax.estimatedSocialContribution(10000, { threshold: 1881.76, rate: 20.5, feeRate: 3.5 }), 2121.75);
const result = tax.fiscalResult({ salesNet: 10000, purchasesNet: 2000, lossesTotal: 500, yearlyAmort: 1000,
  kmFiscal: 200, extraManualCosts: 300, professionalShare: 80, plci: 500, priorLosses: 200,
  socialContributions: 1000, socialExemptionThreshold: 1881.76 });
assert.equal(result.rawCosts, 4000); assert.equal(result.fiscalCosts, 3200);
assert.equal(result.profitBeforeSocial, 6100); assert.equal(result.taxableProfit, 5100);
console.log('Calculs Impôts IPP valides.');
