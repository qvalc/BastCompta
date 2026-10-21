import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/operating-ledger.js';
import '../js/modules/accounting/report-data.js';

const ledger = globalThis.BastOperatingLedger;
test('kilomètres aller-retour et compatibilité des anciens multiplicateurs', () => {
  assert.equal(ledger.kmTotal({ km: 12, trips: 1, roundTrip: true }), 24);
  assert.equal(ledger.kmTotal({ km: 12, trips: 1, roundTrip: false }), 12);
  assert.equal(ledger.kmTotal({ km: 12, trips: 3 }), 36);
  assert.equal(ledger.summarize({ km: [{ km: 12, roundTrip: true }] }).kmTotal, 24);
  const report = globalThis.BastAccountingReportData.build({ data: { km: [{ km: 12, partyType: 'supplier', partyName: 'BigMat', reason: 'Retrait', roundTrip: true }] } });
  assert.equal(report.kmRows[0][1], 'Fournisseur — BigMat');
  assert.equal(report.kmRows[0][5], '24 km');
});

test('groupes par catégorie et nom, années séparées, anciens déplacements conservés', () => {
  const rows = [
    { date: '2026-10-21', partyType: 'client', partyName: 'Dupont', km: 12, roundTrip: true },
    { date: '2026-10-01', partyType: 'client', partyName: ' dupont ', km: 10 },
    { date: '2026-10-01', partyType: 'supplier', partyName: 'Dupont', km: 5 },
    { date: '2025-10-01', partyType: 'client', partyName: 'Dupont', km: 100 },
    { date: '2026-01-01', person: 'Nino', route: 'Ancien trajet', km: 8, trips: 2 },
    { date: '', person: 'Nino', km: 7 }
  ];
  const groups = ledger.kmGroups(rows, '2026');
  assert.equal(groups.length, 3);
  assert.equal(groups.find(g => g.type === 'client').total, 34);
  assert.equal(groups.find(g => g.type === 'client').rows[0].index, 0);
  assert.equal(groups.find(g => g.name === 'À classer').total, 16);
  assert.equal(ledger.kmGroups(rows, 'undated')[0].total, 7);
  assert.equal(ledger.kmGroups(rows, '2025')[0].total, 100);
});

function ui() {
  const source = readFileSync(new URL('../js/comptabilite.js', import.meta.url), 'utf8');
  const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const context = vm.createContext({
    window: {}, data: { km: [] }, activePage: 'km', console,
    BastOperatingLedger: ledger, toNumber: globalThis.BastAccountingCalculations.number,
    escapeHtml: escape, escapeAttr: escape,
    localStorage: { getItem: key => JSON.stringify(key.includes('fournisseurs') ? { suppliers: [{ name: 'BigMat' }] } : { clients: [{ name: 'Dupont' }] }) },
    document: { getElementById: () => null }, render() {}, saveData() {}, notifyPortalBusinessChange() {}
  });
  vm.runInContext(source.slice(source.indexOf('let kmYear ='), source.indexOf('function getPrivateMovementTypeLabel')), context);
  return { context, run: code => vm.runInContext(code, context) };
}

test('création, réutilisation des noms, modification et volets fermés au départ', () => {
  const app = ui();
  assert.equal(app.run("kmNames('client')[0]"), 'Dupont');
  assert.equal(app.run("kmNames('supplier')[0]"), 'BigMat');
  app.run('startKmEditor()');
  assert.match(app.run('renderKmEditor()'), /name="kmRoundTrip" type="checkbox"/);
  app.context.event = { preventDefault() {}, target: { elements: {
    kmDate: { value: '2026-10-21' }, kmType: { value: 'client' }, kmPartyName: { value: 'dupont' },
    kmReason: { value: 'Visite chantier' }, kmDistance: { value: '12' }, kmRoundTrip: { checked: true }
  } } };
  app.run('submitKmEditor(event)');
  assert.equal(app.context.data.km[0].partyName, 'Dupont');
  assert.equal(ledger.kmTotal(app.context.data.km[0]), 24);
  const html = app.run('renderKm()');
  assert.match(html, /Client — Dupont/);
  assert.match(html, /24,00 km/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|>)/);
  app.run('startKmEditor(0)');
  app.context.event.target.elements.kmRoundTrip.checked = false;
  app.run('submitKmEditor(event)');
  assert.equal(app.context.data.km.length, 1);
  assert.equal(ledger.kmTotal(app.context.data.km[0]), 12);
});
