/* BastCompta - préparation pure des notes de crédit. */
(function (global) {
  'use strict';

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function emptyLines() {
    return [{ description: '', qty: 1, unit: 'p', unitPrice: 0, costPrice: 0, discount: 0, vatRate: 21 }];
  }

  function creditLines(rows) {
    const source = Array.isArray(rows) ? rows : emptyLines();
    return source.map(row => ({
      ...clone(row),
      qty: -Math.abs(number(row.qty) || 1)
    }));
  }

  function prepare(invoice = {}, options = {}) {
    const originalNumber = String(options.originalNumber || invoice.documentNumber || '').trim();
    const creditNumber = String(options.creditNumber || '').trim();
    const result = {
      documentNumber: creditNumber,
      linkedInvoiceNumber: originalNumber,
      creditNoteReason: invoice.creditNoteReason || `Note de crédit liée à la facture ${originalNumber}`,
      status: '',
      paidAmount: 0,
      lines: creditLines(invoice.lines)
    };

    if (invoice.suppliesEnabled) {
      result.suppliesLines = creditLines(invoice.suppliesLines);
    }

    return result;
  }

  global.BastCreditNote = Object.freeze({ creditLines, prepare });
})(globalThis);
