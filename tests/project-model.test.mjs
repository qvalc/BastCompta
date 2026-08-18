import assert from 'node:assert/strict';
import '../js/modules/clients/project-model.js';
const model = globalThis.BastProjectModel;
const options = { createId: () => 'generated', now: () => '2026-01-01T00:00:00Z' };
const deduped = model.dedupeMoneyList([{ docKey: 'invoice', ref: 'F-1', amount: 10 }, { docKey: 'invoice', ref: 'F-1', amount: 20 }]);
assert.equal(deduped.length, 1); assert.equal(deduped[0].amount, 20);
const data = model.normalizeData({ projects: [
  { id: 'p1', clientId: 'c1', clientName: 'Dupont', linkedInvoices: [{ docKey: 'invoice', ref: 'F-1', amount: 10 }], tasks: [{ id: 't1' }] },
  { id: 'p2', clientId: 'c1', title: 'Ancien Dupont', linkedInvoices: [{ docKey: 'invoice', ref: 'F-1', amount: 20 }, { docKey: 'invoice', ref: 'F-2', amount: 30 }], notes: [{ id: 'n1' }] }
] }, options);
assert.equal(data.version, 2); assert.equal(data.projects.length, 1);
assert.equal(data.projects[0].linkedInvoices.length, 2); assert.equal(data.projects[0].linkedInvoices.find(item => item.documentUid === 'invoice:f 1').amount, 20);
assert.equal(data.projects[0].tasks.length, 1); assert.equal(data.projects[0].notes.length, 1);
console.log('Fusion des suivis clients valide.');
