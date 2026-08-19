import assert from 'node:assert/strict';
import '../js/modules/accounting/report-template.js';

const template = globalThis.BastAccountingReportTemplate;
assert.match(template.styles, /@page\s*\{\s*size:A4 landscape/);
assert.match(template.styles, /@media print/);
assert.equal(template.date('2026-08-19'), '19/08/2026');
assert.equal(template.date(''), '—');
assert.equal(template.date('invalide', value => `échappé:${value}`), 'échappé:invalide');

const table = template.table(['A', 'B'], [['1', '2']], { compact: true });
assert.match(table, /report-table compact/);
assert.match(table, /<th>A<\/th>/);
assert.match(table, /<td>2<\/td>/);
assert.match(template.table(['A'], []), /Aucune donnée/);

const values = template.keyValues([['Libellé', 'Valeur']]);
assert.match(values, /report-kv-row/);
assert.match(values, /<strong>Valeur<\/strong>/);
console.log("Modèle d'impression comptable valide.");
