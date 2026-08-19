import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/journals.js';

const journals = globalThis.BastAccountingJournals;
const sales = [
  { tvac: 121, rate: 21 },
  { tvac: 106, rate: 6 },
  { tvac: 50, rate: 0, documentType: 'credit_note' }
];
const purchases = [
  { supplier: 'A', invoiceNumber: '1', htva: 0.01, rate: 21, deductible: true, category: 'marchandise' },
  { supplier: 'A', invoiceNumber: '1', htva: 0.02, rate: 21, deductible: true, category: 'marchandise' },
  { supplier: 'B', invoiceNumber: '2', htva: 100, rate: 21, deductible: false, category: 'frais_generaux' }
];

const result = journals.summarize({ sales, purchases });
assert.equal(result.salesNet, 150);
assert.equal(result.salesVat, 27);
assert.equal(result.purchasesVat, 0.01);
assert.equal(result.purchasesMerchandiseNet, 0.03);
assert.equal(result.purchasesGeneralNet, 121);
assert.equal(result.purchasesNet, 121.03);

const exempt = journals.summarize({
  sales: [{ tvac: 121, rate: 21 }],
  purchases: [{ supplier: 'A', invoiceNumber: '1', htva: 100, rate: 21, deductible: true }],
  vatExempt: true,
  isPurchaseVatRecoverable: () => false
});
assert.equal(exempt.salesNet, 121);
assert.equal(exempt.salesVat, 0);
assert.equal(exempt.purchasesVat, 0);
assert.equal(exempt.purchasesNet, 121);
console.log('Journaux comptables valides.');
