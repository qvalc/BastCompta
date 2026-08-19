import assert from 'node:assert/strict';
import '../js/modules/accounting/calculations.js';
import '../js/modules/accounting/purchase-project-sync.js';

const sync = globalThis.BastPurchaseProjectSync;
assert.equal(sync.slug('École du Centre'), 'ecole-du-centre');
const purchases = [
  { supplier: 'A', invoiceNumber: 'A-1', date: '2026-08-01', htva: 100, rate: 21, deductible: true,
    chantierSiteName: 'Jardin Central', chantierClientName: 'Client Démo', pdfFileId: 'pdf-1' }
];
const chantiersData = { projects: [{
  id: 'old', title: 'Ancien', costs: [{ id: 'purchase-supprime', source: 'comptabilite' }], timeline: []
}] };
let sequence = 0;
const options = { now: () => '2026-08-19T10:00:00.000Z', idFactory: prefix => `${prefix}-${++sequence}` };
const result = sync.synchronize(chantiersData, purchases, options);
assert.equal(result.changed, true);
assert.match(purchases[0]._id, /^purchase-/);
assert.equal(chantiersData.projects[0].title, 'Jardin Central');
assert.equal(chantiersData.projects[0].costs[0].htva, 100);
assert.equal(chantiersData.projects[0].costs[0].vat, 21);
assert.equal(chantiersData.projects[0].costs[0].tvac, 121);
assert.equal(chantiersData.projects[0].costs[0].pdfFileId, 'pdf-1');
assert.equal(chantiersData.projects[1].costs.length, 0);

sync.synchronize(chantiersData, purchases, options);
assert.equal(chantiersData.projects[0].costs.length, 1);
assert.equal(chantiersData.projects[0].timeline.length, 1);
const assigned = {};
sync.assignProject(assigned, { id: 'p', clientId: 'c', clientName: 'Client', title: 'Site' });
assert.deepEqual(assigned, { chantierId: 'p', chantierClientId: 'c', chantierClientName: 'Client', chantierSiteName: 'Site' });
sync.assignProject(assigned, null);
assert.deepEqual(assigned, { chantierId: '', chantierClientId: '', chantierClientName: '', chantierSiteName: '' });
console.log('Synchronisation achats et chantiers valide.');
