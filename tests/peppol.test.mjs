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

const prepared = peppol.prepareInvoiceData({
  invoice: {
    documentNumber: 'F-2026-012',
    date: '2026-08-19',
    clientVat: 'BE 0123.456.749',
    notes: '',
    lines: [{ description: 'Travaux', qty: 1, unitPrice: 100, vatRate: 21 }],
    suppliesEnabled: true,
    suppliesLines: [{ description: 'Fourniture', qty: 2, unitPrice: 25, vatRate: 6 }]
  },
  company: {
    vat: 'BE 0123.456.749',
    conditions: 'Paiement sous 30 jours'
  },
  communication: { formatted: '+++123/2026/1201+++' },
  today: '2026-01-01'
});
assert.equal(prepared.lines.length, 2);
assert.equal(prepared.totals.htva, 150);
assert.equal(prepared.totals.tvac, 174);
assert.equal(prepared.supplierEndpoint, '0123456749');
assert.equal(prepared.customerEndpoint, '0123456749');
assert.equal(prepared.issueDate, '2026-08-19');
assert.equal(prepared.dueDate, '2026-08-19');
assert.equal(prepared.invoiceNumber, 'F-2026-012');
assert.equal(prepared.paymentReference, '+++123/2026/1201+++');
assert.equal(prepared.paymentTerms, 'Paiement sous 30 jours');
assert.equal(prepared.currency, 'EUR');
assert.deepEqual(prepared.vatGroups.map(group => group.rate), [6, 21]);

const fallback = peppol.prepareInvoiceData({ invoice: {}, company: {}, today: '2026-01-01' });
assert.equal(fallback.invoiceNumber, 'FACTURE-SANS-NUMERO');
assert.equal(fallback.issueDate, '2026-01-01');
assert.equal(fallback.dueDate, '2026-01-01');
assert.equal(fallback.paymentReference, 'FACTURE-SANS-NUMERO');
console.log('Règles Peppol valides.');
