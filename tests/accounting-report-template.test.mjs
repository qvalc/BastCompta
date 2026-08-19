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
const start = template.documentStart({ title: 'Rapport 2026', companyName: 'Entreprise', period: '2026', generatedAt: 'maintenant', purchaseCount: 2, salesCount: 3,
  metrics: [['Ventes', '100 €']] });
assert.match(start, /<!DOCTYPE html>/);
assert.match(start, /Comptabilité – Entreprise/);
assert.match(start, /Lignes achats :<\/strong> 2/);
assert.match(start, /<span>Ventes<\/span><strong>100 €<\/strong>/);
assert.match(template.section('Titre', 'Contenu'), /<h2 class="section-title">Titre<\/h2>Contenu/);
assert.match(template.panel('Contenu', true), /panel soft/);
assert.match(template.tableSection('Journal', ['Date'], [['19/08/2026']], {}, [['Total', '1']]), /Journal[\s\S]*19\/08\/2026[\s\S]*Total/);
assert.match(template.keyValueGridSection('Bilan', [['Actif', '10']], [['Passif', '10']]), /Bilan[\s\S]*Actif[\s\S]*Passif/);
assert.match(template.resultSection([{ label: 'Recettes', value: '100' }, { label: 'Résultat', value: '50', total: true }], [['Exercice', '2026']]), /Compte de résultat[\s\S]*row total[\s\S]*Exercice/);
assert.match(template.documentEnd(), /<\/html>$/);
console.log("Modèle d'impression comptable valide.");
