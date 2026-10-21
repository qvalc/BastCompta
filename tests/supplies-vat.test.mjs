import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import '../js/modules/documents/calculations.js';

const source = readFileSync(new URL('../js/gestion-commerciale.js', import.meta.url), 'utf8');
const calc = globalThis.BastDocumentCalculations;

test('TVA des fournitures sélectionnable, sauvegardée et calculée pour chaque document', () => {
  const context = vm.createContext({
    data: {}, escapeHtml: String, escapeAttr: String, num: Number,
    toNumber: Number, lineNet: calc.lineNet, money: String,
    getDevisFactureChangeSnapshot: () => ({}), getDocumentLabel: key => key,
    notifyPortalBusinessChange() {}, saveData() {}
  });
  vm.runInContext(source.slice(source.indexOf('function renderLinesTable('), source.indexOf('function renderCompanyBlock(')), context);
  vm.runInContext(source.slice(source.indexOf('function setDocumentLineField('), source.indexOf('function lineBase(')), context);
  for (const key of ['quote', 'invoice', 'reminder']) {
    context.data[key] = {
      lines: [{ qty: 1, unitPrice: 100, vatRate: 21 }], suppliesEnabled: true,
      suppliesLines: [{ description: 'Fourniture', qty: 2, unitPrice: 50, costPrice: 30, vatRate: 21 }]
    };
    for (const rate of [0, 6, 12, 21]) {
      vm.runInContext(`setDocumentLineField('${key}', 'suppliesLines', 0, 'vatRate', ${rate})`, context);
      const html = vm.runInContext(`renderLinesTable('${key}', 'suppliesLines', 'Fournitures')`, context);
      assert.match(html, /doc-table-supplies/);
      assert.match(html, /class="line-vat"/);
      assert.match(html, new RegExp(`<option value="${rate}" selected>`));
      assert.match(html, new RegExp(`setDocumentLineField\\('${key}', 'suppliesLines', 0, 'vatRate'`));
      const restored = JSON.parse(JSON.stringify(context.data[key]));
      assert.equal(restored.suppliesLines[0].vatRate, rate);
      assert.equal(calc.totalsForDocument(restored).vat, 21 + rate);
      assert.equal(calc.totalsForDocument(restored).tvac, 221 + rate);
      const payload = calc.invoiceAccountingPayload(restored);
      assert.ok(payload.rows.some(row => row.rate === rate));
    }
  }
});
