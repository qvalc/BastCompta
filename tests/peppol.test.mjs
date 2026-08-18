import assert from 'node:assert/strict';
import '../js/modules/documents/calculations.js';
import '../js/modules/documents/peppol.js';

const peppol = globalThis.BastPeppol;
assert.equal(peppol.escapeXml('A & B <test>'), 'A &amp; B &lt;test&gt;');
assert.equal(peppol.amount(12.5), '12.50');
assert.equal(peppol.country('FR123'), 'FR');
assert.equal(peppol.country('0123456749'), 'BE');
assert.equal(peppol.taxCategory(0), 'Z');
assert.equal(peppol.taxCategory(21), 'S');
assert.equal(peppol.unitCode('heure'), 'HUR');
assert.equal(peppol.unitCode('pièce'), 'C62');

const groups = peppol.groupVat([
  { qty: 1, unitPrice: 100, vatRate: 21 },
  { qty: 2, unitPrice: 50, vatRate: 6 },
  { qty: 1, unitPrice: 20, vatRate: 21 }
]);
assert.deepEqual(groups.map(group => group.rate), [6, 21]);
assert.equal(groups[0].base, 100); assert.equal(groups[0].tax, 6);
assert.equal(groups[1].base, 120); assert.equal(groups[1].tax, 25.2);
const endpoints = peppol.validateBelgianEndpoints('BE0123456749', 'BE0123456749');
assert.equal(endpoints.supplierValid, true); assert.equal(endpoints.customerValid, true);
console.log('Règles Peppol valides.');
