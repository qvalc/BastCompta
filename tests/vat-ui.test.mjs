import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/vat-ui.js';
const ui = globalThis.BastVatUi;
const format = { money: value => `${value} EUR`, date: value => `date:${value}`, situation: () => 'Situation' };
let view = ui.declarationView({ declaration: {}, computed: { dueAmount: 100 }, outstanding: 100 }, format);
assert.equal(view.netLabel, 'À payer : 100 EUR'); assert.equal(view.netLabelClass, 'status-bad'); assert.match(view.paymentBadge, /TVA à payer/);
view = ui.declarationView({ declaration: { paymentAmount: 40 }, computed: { dueAmount: 100 }, outstanding: 60 }, format);
assert.equal(view.netLabel, 'Solde restant : 60 EUR');
view = ui.declarationView({ declaration: { closed: true, dueDate: '2026-04-25' }, computed: { dueAmount: 100 }, outstanding: 0 }, format);
assert.equal(view.disableAttr, 'disabled'); assert.match(view.statusBadge, /Clôturé/); assert.equal(view.dueDateLabel, 'date:2026-04-25');
view = ui.declarationView({ declaration: { reimbursementRequested: true }, computed: { creditAmount: 25 }, outstanding: 0 }, format);
assert.match(view.netLabel, /Remboursement demandé/);
assert.match(ui.overview({ initialCredit: 10, totalUnfiledDue: 20, totalUnfiledCredit: 5 }, String), /15/);
assert.match(ui.exemptPage(true), /page active/);
assert.match(ui.miniSummary({ '54': 21, '59': 10, '71': 11, '72': 0 }, String), /Grille 54[\s\S]*21/);
assert.match(ui.primaryCodes({ '01': 100, '54': 21 }, String), /Opérations à 6 %[\s\S]*TVA due sur ventes/);
const extra = ui.extraCodes({ id: 'vat-1', closed: true, showExtraCodes: true, manualBoxes: { '44': 12, '91': 3 } },
  { boxes: { '81': 100, '82': 50, '83': 25 } }, 2, { num: String, attr: String, money: String });
assert.match(extra, /vat-extra-body open/); assert.match(extra, /manualBoxes\['44'\]/); assert.match(extra, /declarations\[2\]/); assert.match(extra, /disabled/);
const form = ui.declarationForm({ year: 2026, quarter: 3, filed: true, paid: false, closed: true, paymentAmount: 10 }, 1, { attr: String, num: String });
assert.match(form, /value="3" selected>T3 \(juillet à septembre\)/); assert.match(form, /setVatClosed\(1/); assert.match(form, /période verrouillée/);
const detail = ui.calculationSummary({ computed: { salesVat: 21, deductibleVat: 10, previousCredit: 2, boxes: { '71': 9, '72': 0 }, salesCount: 1, purchaseCount: 2 }, outstanding: 9 }, String);
assert.match(detail, /TVA ventes[\s\S]*21/); assert.match(detail, /status-bad/); assert.match(detail, /Lignes achats[\s\S]*2/);
const cardRow = { declaration: { id: 'vat-2026-1', year: 2026, quarter: 1, notes: 'Note test' }, computed: {
  startDate: '2026-01-01', endDate: '2026-03-31', dueAmount: 11, salesCount: 2, purchaseCount: 3,
  boxes: { '54': 21, '59': 10, '71': 11, '72': 0 }
}, outstanding: 11 };
const cardFormat = { ...format, quarter: (year, quarter) => `T${quarter} ${year}`, escape: String, attr: String, num: String };
const collapsedCard = ui.declarationCard(cardRow, 0, cardFormat);
assert.match(collapsedCard, /T1 2026/); assert.match(collapsedCard, /2 vente\(s\)/); assert.match(collapsedCard, /3 achat\(s\)/);
assert.match(collapsedCard, /toggleVatDeclarationExpanded\('vat-2026-1'\)/); assert.doesNotMatch(collapsedCard, /vat-expanded-panel/);
const expandedCard = ui.declarationCard(cardRow, 0, { ...cardFormat, expanded: true });
assert.match(expandedCard, /vat-expanded-panel/); assert.match(expandedCard, /Note test/); assert.match(expandedCard, /deleteVatDeclaration\(0\)/);
const lockedCard = ui.declarationCard({ ...cardRow, declaration: { ...cardRow.declaration, closed: true } }, 0, { ...cardFormat, expanded: true });
assert.match(lockedCard, /<textarea disabled/); assert.match(lockedCard, /aria-label="Supprimer" disabled/);
console.log('Interface TVA valide.');
