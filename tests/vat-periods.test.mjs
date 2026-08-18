import assert from 'node:assert/strict';
import '../js/modules/accounting/vat-periods.js';
const vat = globalThis.BastVatPeriods;
assert.deepEqual(vat.bounds(2026, 1), { start: '2026-01-01', end: '2026-03-31' });
assert.deepEqual(vat.bounds(2026, 4), { start: '2026-10-01', end: '2026-12-31' });
assert.equal(vat.dueDate(2026, 1), '2026-04-27'); // le 25 avril 2026 tombe un samedi
assert.equal(vat.label(2026, 3), 'T3 2026');
const declaration = vat.template(2026, 2, () => 'vat-id');
assert.equal(declaration.id, 'vat-id'); assert.equal(declaration.startDate, '2026-04-01');
assert.equal(declaration.endDate, '2026-06-30'); assert.equal(Object.keys(declaration.manualBoxes).length, 13);
const old = { year: 2026, quarter: 1, manualBoxes: { '44': 10 } }; vat.ensureDeclaration(old);
assert.equal(old.manualBoxes['44'], 10); assert.equal(old.manualBoxes['91'], 0); assert.equal(old.closed, false);
console.log('Périodes TVA valides.');
