import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../js/modules/documents/calculations.js';
import '../js/modules/documents/credit-note.js';
import '../js/modules/documents/document-transfer.js';

const calc = globalThis.BastDocumentCalculations;
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
