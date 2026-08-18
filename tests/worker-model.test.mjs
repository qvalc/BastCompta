import assert from 'node:assert/strict';
import '../js/modules/personnel/worker-model.js';
const model = globalThis.BastWorkerModel;
const worker = model.normalize({ firstName: 'Jean', weeklyHours: '30,5', active: false, leaves: null }, () => 'w1');
assert.equal(worker.id, 'w1'); assert.equal(worker.weeklyHours, 30.5); assert.equal(worker.active, false);
assert.deepEqual(worker.leaves, []); assert.deepEqual(worker.documents, []); assert.equal(worker.annualLeaveDays, 20);
const data = model.normalizeData({ workers: [worker] }, { createId: () => 'x', now: () => 'now' });
assert.equal(data.workers.length, 1); assert.equal(data.version, 1);
console.log('Modèle Personnel valide.');
