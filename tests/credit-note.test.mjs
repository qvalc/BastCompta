import assert from 'node:assert/strict';
import '../js/modules/documents/credit-note.js';

const creditNote = globalThis.BastCreditNote;
const invoice = {
  documentNumber: 'F-2026-010',
  paidAmount: 121,
  status: 'paid',
  lines: [
    { description: 'Travaux', qty: 2, unitPrice: 100 },
    { description: 'Correction', qty: -3, unitPrice: 10 },
    { description: 'Quantité vide', qty: 0, unitPrice: 5 }
  ],
  suppliesEnabled: true,
  suppliesLines: [{ description: 'Fourniture', qty: 4, unitPrice: 20 }]
};

const prepared = creditNote.prepare(invoice, { creditNumber: 'NC-2026-001' });
assert.equal(prepared.documentNumber, 'NC-2026-001');
assert.equal(prepared.linkedInvoiceNumber, 'F-2026-010');
assert.equal(prepared.creditNoteReason, 'Note de crédit liée à la facture F-2026-010');
assert.equal(prepared.status, '');
assert.equal(prepared.paidAmount, 0);
assert.deepEqual(prepared.lines.map(row => row.qty), [-2, -3, -1]);
assert.equal(prepared.suppliesLines[0].qty, -4);
prepared.lines[0].description = 'Modifié';
assert.equal(invoice.lines[0].description, 'Travaux');
assert.equal(invoice.paidAmount, 121);

const customReason = creditNote.prepare({
  documentNumber: 'F-2026-011',
  creditNoteReason: 'Erreur de prix',
  lines: []
}, { creditNumber: 'NC-2026-002' });
assert.equal(customReason.creditNoteReason, 'Erreur de prix');
assert.equal(customReason.suppliesLines, undefined);

console.log('Préparation des notes de crédit valide.');
