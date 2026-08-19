import assert from 'node:assert/strict';
import '../js/modules/documents/document-transfer.js';

const transfer = globalThis.BastDocumentTransfer;
const quote = {
  documentNumber: 'D-2026-010',
  clientId: 'client-1',
  clientName: 'Client test',
  chantierId: 'chantier-1',
  lines: [{ description: 'Travaux', qty: 2, unitPrice: 50 }],
  suppliesEnabled: true,
  suppliesLines: [{ description: 'Fourniture', qty: 1, unitPrice: 20 }],
  notes: 'Note du devis'
};
const invoice = transfer.quoteToInvoice(quote);
assert.equal(invoice.clientName, 'Client test');
assert.equal(invoice.status, 'draft');
assert.equal(invoice.paidAmount, 0);
assert.equal(invoice.documentNumber, undefined);
invoice.lines[0].description = 'Modifié';
assert.equal(quote.lines[0].description, 'Travaux');

const reminder = transfer.invoiceToReminder({
  ...invoice,
  documentNumber: 'F-2026-010',
  date: '2026-08-01',
  dueDate: '2026-08-31',
  paidAmount: '25',
  status: 'partial'
});
assert.equal(reminder.date, '2026-08-01');
assert.equal(reminder.dueDate, '2026-08-31');
assert.equal(reminder.paidAmount, 25);
assert.equal(reminder.documentNumber, undefined);
assert.equal(reminder.status, undefined);

console.log('Transferts entre documents valides.');
