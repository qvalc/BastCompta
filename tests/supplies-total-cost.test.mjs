import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../js/modules/documents/calculations.js';
import '../js/modules/documents/credit-note.js';
import '../js/modules/documents/document-transfer.js';

const calc = globalThis.BastDocumentCalculations;
test('saisie unitaire : conversion des anciens totaux et recalcul selon la quantité', () => {
  const source = readFileSync(new URL('../js/gestion-commerciale.js', import.meta.url), 'utf8');
  const row = { qty: 150, unitPrice: 2.10, costPrice: 1.85, costTotal: 277.50 };
  const context = vm.createContext({
    data: { quote: { suppliesLines: [row] } }, BastDocumentCalculations: calc,
    getDevisFactureChangeSnapshot: () => ({}), getDocumentLabel: () => 'Devis',
    notifyPortalBusinessChange() {}, saveData() {}
  });
  vm.runInContext(source.slice(source.indexOf('function setDocumentLineField('), source.indexOf('function lineBase(')), context);
  assert.equal(calc.lineUnitCost(row), 1.85);
  vm.runInContext("setDocumentLineField('quote', 'suppliesLines', 0, 'qty', 200)", context);
  assert.equal(row.costTotal, undefined);
  assert.equal(calc.lineCost(row), 370);
  row.qty = 42;
  row.costPrice = 122.70;
  row.costTotal = 5153.40;
  vm.runInContext("setDocumentLineField('quote', 'suppliesLines', 0, 'costPrice', 2.92)", context);
  assert.equal(row.costTotal, undefined);
  assert.equal(Math.round(calc.lineCost(row) * 100) / 100, 122.64);
  assert.equal(calc.lineUnitCost({ qty: 150, costPrice: 1.85 }), 1.85);
  assert.equal(calc.lineCost({ qty: 150, costPrice: 1.85 }), 277.5);
});

test('le chargement du suivi ne remplace pas le coût local corrigé par un ancien export Drive', async () => {
  const source = readFileSync(new URL('../js/suivi-client.js', import.meta.url), 'utf8');
  const linked = [];
  const context = vm.createContext({
    hydrateProjectWithCrm: value => value, getProject: () => ({ id: 'client-1' }),
    getLocalCrmDocumentsForProject: () => [{ key: 'invoice', ref: 'F-2026-007', suppliesCost: 122.64 }],
    getDriveCrmDocumentsForProject: async () => [
      { key: 'invoice', ref: 'F-2026-007', suppliesCost: 5153.4 },
      { key: 'invoice', ref: 'F-2025-003', suppliesCost: 482.6 }
    ],
    dedupeCrmDocs: docs => docs, toggleCrmDocumentLink: async (type, ref, checked, id, doc) => linked.push(doc),
    notify() {}
  });
  vm.runInContext(source.slice(source.indexOf('async function autoLoadClientDocuments('), source.indexOf('function getProject(')), context);
  await vm.runInContext('autoLoadClientDocuments()', context);
  assert.equal(linked.length, 2);
  assert.equal(linked.find(doc => doc.ref === 'F-2026-007').suppliesCost, 122.64);
});

test('42 unités avec 122,70 € de revient total gardent un coût de 122,70 €', () => {
  const row = { qty: 42, unitPrice: 3.95, costPrice: 122.70, costTotal: 122.70, vatRate: 21 };
  const doc = { suppliesEnabled: true, suppliesLines: [row] };
  assert.equal(calc.lineCost(row), 122.70);
  assert.equal(calc.totalsForDocument(doc).suppliesCostHtva, 122.70);
  assert.equal(calc.lineCost({ ...row, qty: 50 }), 122.70);
  assert.equal(calc.lineCost({ ...row, costTotal: 0 }), 0);
  assert.equal(calc.lineCost({ qty: 42, costPrice: 2 }), 84);
  assert.equal(calc.totalsForDocument(doc).suppliesSaleHtva, 165.9);
  for (const transfer of [BastDocumentTransfer.quoteToInvoice, BastDocumentTransfer.invoiceToReminder]) {
    assert.equal(calc.lineCost(transfer(doc).suppliesLines[0]), 122.70);
  }
  const credit = BastCreditNote.prepare(doc);
  assert.equal(calc.lineCost(credit.suppliesLines[0]), -122.70);
});

test('le suivi client utilise le même coût total, y compris zéro', () => {
  const source = readFileSync(new URL('../js/suivi-client.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function moneyLineCostHtva('), source.indexOf('function documentTotals(')), context);
  assert.equal(vm.runInContext('moneyLineCostHtva({qty:42,costPrice:122.70,costTotal:122.70})', context), 122.70);
  assert.equal(vm.runInContext('moneyLineCostHtva({qty:42,costPrice:122.70,costTotal:0})', context), 0);
  assert.equal(vm.runInContext('moneyLineCostHtva({qty:42,costPrice:2})', context), 84);
});
