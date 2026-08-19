import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/exercise.js';

const exercise = globalThis.BastAccountingExercise;
assert.equal(exercise.validateYear(' 2027 '), '2027');
assert.throws(() => exercise.validateYear('27'), /Année invalide/);
assert.equal(exercise.fileName({ company: { name: 'Éts Démo & Fils', period: '2027' } }), 'comptabilite-ets-demo-fils-2027.json');
assert.equal(exercise.fileName({}), 'comptabilite-export.json');

const defaults = {
  company: {}, sales: [], purchases: [], stock: [], assets: [], investments: [], losses: [], km: [], privateMovements: [],
  settings: { retainedEarnings: 0, vatCarryover: 0, ownerAccountCarryover: 0, nested: { defaultValue: true } },
  vat: { declarations: [] }
};
const currentData = {
  company: { name: 'Entreprise', period: '2026', notes: 'Note conservée' },
  sales: [{ invoiceNumber: 'F-1' }], purchases: [{ invoiceNumber: 'A-1' }],
  stock: [{ label: 'Stock' }], assets: [{ label: 'Machine' }], investments: [{ description: 'Camionnette' }],
  losses: [{}], km: [{}], privateMovements: [{}],
  settings: { retainedEarnings: 1000, vatCarryover: 20, ownerAccountCarryover: 50, nested: { customValue: true } },
  vat: { declarations: [{}] }
};
const next = exercise.createNext({ currentData, defaults, targetYear: '2027', totals: {
  estimatedProfit: 250.555, receivableVat: 80.126, ownerAccountBalance: -35.555
} });
assert.equal(next.company.period, '2027');
assert.equal(next.company.notes, 'Note conservée');
assert.deepEqual(next.stock, currentData.stock);
assert.deepEqual(next.assets, currentData.assets);
assert.deepEqual(next.investments, currentData.investments);
assert.deepEqual(next.sales, []);
assert.deepEqual(next.purchases, []);
assert.deepEqual(next.losses, []);
assert.deepEqual(next.km, []);
assert.deepEqual(next.privateMovements, []);
assert.deepEqual(next.vat.declarations, []);
assert.equal(next.settings.retainedEarnings, 1250.56);
assert.equal(next.settings.vatCarryover, 80.13);
assert.equal(next.settings.ownerAccountCarryover, -35.55);
assert.deepEqual(next.settings.nested, { defaultValue: true, customValue: true });
next.stock[0].label = 'Modifié';
assert.equal(currentData.stock[0].label, 'Stock');
console.log("Création de l'exercice suivant valide.");
