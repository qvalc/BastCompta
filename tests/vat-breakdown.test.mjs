import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../js/modules/documents/calculations.js';

const calc = globalThis.BastDocumentCalculations;
const doc = {
  lines: [
    { qty: 2, unitPrice: 100, discount: 10, vatRate: 21 },
    { qty: 1, unitPrice: 50, vatRate: 6 },
    { qty: 1, unitPrice: 20, vatRate: 0 },
    { qty: 0, unitPrice: 0, vatRate: 12 }
  ],
  suppliesEnabled: true,
  suppliesLines: [{ qty: 1, unitPrice: 100, vatRate: 6 }]
};

test('TVA regroupée après remise, fournitures comprises, taux nul inclus', () => {
  const rows = calc.vatBreakdown(doc);
  assert.deepEqual(rows, [
    { rate: 0, base: 20, vat: 0 },
    { rate: 6, base: 150, vat: 9 },
    { rate: 21, base: 180, vat: 37.8 }
  ]);
  const totals = calc.totalsForDocument(doc);
  assert.equal(rows.reduce((sum, row) => sum + row.base, 0), totals.htva);
  assert.equal(rows.reduce((sum, row) => sum + row.vat, 0), totals.vat);
  assert.equal(calc.vatBreakdown({ ...doc, suppliesEnabled: false })[1].base, 50);
  assert.deepEqual(calc.vatBreakdown({}), []);
  assert.deepEqual(calc.vatBreakdown({ lines: [{ qty: -1, unitPrice: 100, vatRate: 21 }] }), [{ rate: 21, base: -100, vat: -21 }]);
});

test('récapitulatif lisible dans le document et inclus à l’impression', () => {
  const source = readFileSync(new URL('../js/gestion-commerciale.js', import.meta.url), 'utf8');
  const context = vm.createContext({ BastDocumentCalculations: calc, doc, escapeHtml: String, money: value => `${value.toFixed(2)} €` });
  vm.runInContext(source.slice(source.indexOf('function renderVatBreakdown('), source.indexOf('function renderCompanyBlock(')), context);
  const html = vm.runInContext('renderVatBreakdown(doc)', context);
  assert.match(html, /Détail de la TVA/);
  assert.match(html, /Base HTVA/);
  assert.match(html, /150.00 €/);
  assert.match(html, /6 %/);
  assert.doesNotMatch(html, /no-print/);
  assert.match(source, /\$\{renderVatBreakdown\(doc\)\}/);
});
