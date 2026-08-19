/* BastCompta - transferts purs entre devis, factures et rappels. */
(function (global) {
  'use strict';

  const sharedFields = Object.freeze([
    'clientId', 'clientNumber', 'clientVat', 'clientName', 'clientEmail',
    'address', 'siteName', 'chantierId', 'notes'
  ]);

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function emptyLines() {
    return [{ description: '', qty: 1, unit: 'p', unitPrice: 0, costPrice: 0, discount: 0, vatRate: 21 }];
  }

  function pick(source = {}, fields = []) {
    return fields.reduce((target, field) => {
      target[field] = clone(source[field] ?? '');
      return target;
    }, {});
  }

  function lineSections(source = {}) {
    return {
      lines: clone(Array.isArray(source.lines) ? source.lines : emptyLines()),
      suppliesEnabled: !!source.suppliesEnabled,
      suppliesLines: clone(Array.isArray(source.suppliesLines)
        ? source.suppliesLines
        : emptyLines())
    };
  }

  function quoteToInvoice(source = {}) {
    return {
      ...pick(source, sharedFields),
      ...lineSections(source),
      status: 'draft',
      linkedInvoiceNumber: '',
      creditNoteReason: '',
      paidAmount: 0
    };
  }

  function invoiceToReminder(source = {}) {
    return {
      ...pick(source, [...sharedFields, 'date', 'dueDate']),
      ...lineSections(source),
      paidAmount: Number.isFinite(Number(source.paidAmount)) ? Number(source.paidAmount) : 0
    };
  }

  global.BastDocumentTransfer = Object.freeze({ quoteToInvoice, invoiceToReminder });
})(globalThis);
