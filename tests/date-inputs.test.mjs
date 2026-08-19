import assert from 'node:assert/strict';
import '../js/date-inputs.js';

const dates = globalThis.BastDateInputs;
assert.equal(dates.normalize('11-03-1986'), '1986-03-11');
assert.equal(dates.normalize('11/03/1986'), '1986-03-11');
assert.equal(dates.normalize('11031986'), '1986-03-11');
assert.equal(dates.normalize('1986-03-11'), '1986-03-11');
assert.equal(dates.display('1986-03-11'), '11-03-1986');
assert.equal(dates.normalize('29-02-2024'), '2024-02-29');
assert.equal(dates.normalize('29-02-2023'), null);
assert.equal(dates.normalize('31-04-2026'), null);
assert.equal(dates.normalize('01-01-0001'), null);
assert.equal(dates.normalize(''), '');
console.log('Saisie globale des dates valide.');
