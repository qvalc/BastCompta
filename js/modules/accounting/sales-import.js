/* BastCompta - préparation pure de l'import des factures dans le journal des ventes. */
(function (global) {
  'use strict';

  function normalizeRow(row = {}) {
    const calc = global.BastAccountingCalculations;
    const documentStatus = String(row.documentStatus || 'sent');
    const documentType = String(row.documentType || 'invoice');
    const rawTvac = calc.round2(row.tvac);
    const creditNote = documentType.toLowerCase() === 'credit_note'
      || documentStatus.toLowerCase() === 'credit_note';
    return {
      date: String(row.date || ''),
      client: String(row.client || ''),
      invoiceNumber: String(row.invoiceNumber || ''),
      linkedInvoiceNumber: String(row.linkedInvoiceNumber || ''),
      documentStatus,
      documentType,
      description: String(row.description || ''),
      rate: calc.number(row.rate),
      tvac: creditNote ? -Math.abs(rawTvac) : rawTvac
    };
  }

  const isMeaningful = row => row.tvac !== 0 || row.description || row.invoiceNumber || row.client;
  const typeLabel = row => row?.documentType === 'credit_note' || row?.documentStatus === 'credit_note'
    ? 'Note de crédit'
    : 'Facture';

  function prepare(payloadOrRows) {
    const payload = Array.isArray(payloadOrRows) ? { action: 'upsert', rows: payloadOrRows } : (payloadOrRows || {});
    const action = String(payload.action || 'upsert');
    const incomingRows = (Array.isArray(payload.rows) ? payload.rows : []).map(normalizeRow).filter(isMeaningful);
    const invoiceNumbers = [...new Set([
      String(payload.invoiceNumber || '').trim(),
      ...incomingRows.map(row => row.invoiceNumber)
    ].filter(Boolean))];
    return {
      action,
      incomingRows,
      invoiceNumbers,
      hasCreditNote: incomingRows.some(row => row.documentType === 'credit_note')
    };
  }

  const matchingRows = (sales = [], invoiceNumbers = []) => sales.filter(
    row => invoiceNumbers.includes(String(row.invoiceNumber || ''))
  );

  function sortByDate(rows) {
    return rows.slice().sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    });
  }

  function apply(sales = [], plan = {}) {
    const invoiceNumbers = plan.invoiceNumbers || [];
    const remaining = sales.filter(row => !invoiceNumbers.includes(String(row.invoiceNumber || '')));
    if (plan.action === 'cancel') {
      const count = sales.length - remaining.length;
      return {
        sales: sortByDate(remaining),
        count,
        message: count
          ? `Facture annulée : ${count} ligne(s) retirée(s) du journal des ventes.`
          : 'Facture annulée : aucune ligne existante à retirer du journal des ventes.'
      };
    }
    const incomingRows = plan.incomingRows || [];
    const count = incomingRows.length;
    return {
      sales: sortByDate([...remaining, ...incomingRows]),
      count,
      message: count
        + (plan.hasCreditNote ? ' ligne(s) de note de crédit ajoutée(s) dans le journal des ventes.' : ' ligne(s) ajoutée(s) dans le journal des ventes.')
        + (invoiceNumbers.length ? ' Les anciennes lignes avec le même N° document ont été remplacées.' : '')
    };
  }

  global.BastSalesImport = Object.freeze({ normalizeRow, isMeaningful, typeLabel, prepare, matchingRows, sortByDate, apply });
})(globalThis);
