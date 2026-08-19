import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/fixed-assets.js';

const fixedAssets = globalThis.BastFixedAssets;
const result = fixedAssets.summarize({
  currentYear: 2026,
  investments: [
    { date: '2026-01-15', supplier: 'A', amount: 1200, durationMonths: 12 },
    { date: '', supplier: 'B', amount: 100, durationMonths: 0 }
  ],
  assets: [
    { date: '', label: 'Sans date', amount: 500, durationMonths: 60 },
    { date: '2026-03-01', label: 'Récent', amount: 1200, durationMonths: 12 },
    { date: '2025-03-01', label: 'Ancien', amount: 2400, durationMonths: 24 }
  ]
});

assert.equal(result.investmentComputed[0].supplier, 'A');
assert.equal(result.investmentComputed[0].amortYear, 1100);
assert.equal(result.investmentComputed[1].durationMonths, 60);
assert.deepEqual(result.assetsComputed.map(row => row.label), ['Récent', 'Ancien', 'Sans date']);
assert.deepEqual(result.assetsComputed.map(row => row.sourceIndex), [1, 2, 0]);
assert.equal(result.investmentsGross, 1300);
assert.equal(result.investmentsYearlyAmort, 1100);
assert.equal(result.assetsGross, 4100);
assert.equal(result.assetsNetValue, 1100);
assert.equal(result.assetsTotalAmortized, 3000);
console.log('Investissements et immobilisations valides.');
