import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../js/modules/documents/calculations.js';
import '../js/modules/documents/document-transfer.js';

const source = readFileSync(new URL('../js/gestion-commerciale.js', import.meta.url), 'utf8');
test('insertion et déplacement dans les trois documents et leurs fournitures', () => {
  for (const docKey of ['quote', 'invoice', 'reminder']) {
    for (const section of ['lines', 'suppliesLines']) {
      let saves = 0;
      const first = { description: 'A', qty: 2, unitPrice: 50, costPrice: 20, vatRate: 6 };
      const second = { description: 'B', qty: 1, unitPrice: 40, costPrice: 30, vatRate: 21 };
      const doc = { lines: [], suppliesLines: [], suppliesEnabled: true, [section]: [first, second] };
      const context = vm.createContext({ data: { [docKey]: doc }, notifyPortalBusinessChange() {}, saveData() { saves++; } });
      vm.runInContext(source.slice(source.indexOf('function createEmptyLine('), source.indexOf('function deleteLine(')), context);
      const run = code => vm.runInContext(code, context);
      const totals = BastDocumentCalculations.totalsForDocument(doc);
      run(`moveDocumentLine('${docKey}', '${section}', 1, -1)`);
      assert.equal(doc[section][0], second);
      assert.equal(doc[section][1], first);
      assert.deepEqual(BastDocumentCalculations.totalsForDocument(doc), totals);
      run(`moveDocumentLine('${docKey}', '${section}', 0, -1)`);
      run(`moveDocumentLine('${docKey}', '${section}', 1, 1)`);
      assert.equal(saves, 1);
      run(`addLine('${docKey}', '${section}', 1)`);
      assert.deepEqual(doc[section].map(row => row.description), ['B', '', 'A']);
      run(`addLine('${docKey}', '${section}', 0)`);
      run(`addLine('${docKey}', '${section}')`);
      assert.deepEqual(doc[section].map(row => row.description), ['', 'B', '', 'A', '']);
      assert.equal(doc[section][3].vatRate, 6);
      const restored = JSON.parse(JSON.stringify(doc));
      const transferred = BastDocumentTransfer.quoteToInvoice(restored);
      assert.deepEqual(transferred[section].map(row => row.description), ['', 'B', '', 'A', '']);
    }
  }
});
