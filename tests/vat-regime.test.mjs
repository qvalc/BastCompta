import assert from 'node:assert/strict';
import '../js/modules/accounting/vat-regime.js';

const regime = globalThis.BastVatRegime;
assert.equal(regime.get({}), 'taxable');
assert.equal(regime.label('mixed'), 'Assujetti mixte');
assert.equal(regime.label('inconnu'), 'Assujetti TVA');
assert.equal(regime.isExempt('exempt_article_44'), true);
assert.equal(regime.isMixed('mixed'), true);
assert.equal(regime.hasEntries({ sales: [], purchases: [], vat: { declarations: [] } }), false);
assert.equal(regime.hasEntries({ sales: [{ tvac: 121 }] }), true);
assert.equal(regime.hasEntries({ vat: { declarations: [{}] } }), true);

const exemptData = {
  settings: { vatRegime: 'exempt_article_44', vatCarryover: 12.34 },
  sales: [{ rate: 21 }],
  purchases: [{ deductible: true }]
};
regime.applyRules(exemptData);
assert.equal(exemptData.sales[0].rate, 0);
assert.equal(exemptData.purchases[0].deductible, false);
assert.equal(exemptData.settings.vatCarryover, 0);

const taxableData = { settings: { vatRegime: 'taxable', vatCarryover: 12.34 }, sales: [{ rate: 21 }] };
regime.applyRules(taxableData);
assert.equal(taxableData.sales[0].rate, 21);
assert.equal(taxableData.settings.vatCarryover, 12.34);
console.log('Régimes TVA valides.');
