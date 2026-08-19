/* BastCompta - regles pures Peppol/UBL. */
(function (global) {
  'use strict';
  const trim = value => String(value ?? '').trim();
  const amount = value => Number(value || 0).toFixed(2);
  const escapeXml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const country = vatNumber => {
    const normalized = global.BastDocumentCalculations.normalizeVatNumber(vatNumber);
    return /^[A-Z]{2}/.test(normalized) ? normalized.slice(0, 2) : 'BE';
  };
  const taxCategory = rate => Number(rate || 0) === 0 ? 'Z' : 'S';
  const unitCode = unit => trim(unit).toLowerCase().includes('h') ? 'HUR' : 'C62';

  function groupVat(lines = []) {
    const groups = new Map();
    for (const line of lines) {
      const rate = Number(line.vatRate || 0);
      const current = groups.get(rate) || { rate, category: taxCategory(rate), base: 0, tax: 0 };
      current.base += global.BastDocumentCalculations.lineNet(line);
      current.tax += global.BastDocumentCalculations.lineVat(line);
      groups.set(rate, current);
    }
    return [...groups.values()].sort((a, b) => a.rate - b.rate);
  }

  function validateBelgianEndpoints(supplierVat, customerVat) {
    const calculations = global.BastDocumentCalculations;
    const supplier = calculations.belgianEnterpriseNumber(supplierVat);
    const customer = calculations.belgianEnterpriseNumber(customerVat);
    return {
      supplier, customer,
      supplierValid: calculations.isValidBelgianEnterpriseNumber(supplier),
      customerValid: calculations.isValidBelgianEnterpriseNumber(customer)
    };
  }

  function invoiceLines(invoice = {}) {
    const mainLines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const suppliesLines = invoice.suppliesEnabled && Array.isArray(invoice.suppliesLines)
      ? invoice.suppliesLines
      : [];
    return [...mainLines, ...suppliesLines].filter(row => {
      return trim(row.description) || Number(row.qty || 0) || Number(row.unitPrice || 0);
    });
  }

  function prepareInvoiceData(options = {}) {
    const invoice = options.invoice || {};
    const company = options.company || {};
    const communication = options.communication || {};
    const lines = invoiceLines(invoice);
    const totals = global.BastDocumentCalculations.totalsForDocument(invoice);
    const supplierVat = global.BastDocumentCalculations.normalizeVatNumber(company.vat);
    const customerVat = global.BastDocumentCalculations.normalizeVatNumber(invoice.clientVat);
    const issueDate = invoice.date || options.today || new Date().toISOString().slice(0, 10);
    const invoiceNumber = trim(invoice.documentNumber) || 'FACTURE-SANS-NUMERO';

    return {
      invoice,
      company,
      lines,
      totals,
      vatGroups: groupVat(lines),
      supplierVat,
      customerVat,
      supplierCountry: country(supplierVat),
      customerCountry: country(customerVat),
      supplierEndpoint: global.BastDocumentCalculations.belgianEnterpriseNumber(supplierVat),
      customerEndpoint: global.BastDocumentCalculations.belgianEnterpriseNumber(customerVat),
      issueDate,
      dueDate: invoice.dueDate || issueDate,
      invoiceNumber,
      paymentReference: trim(communication.formatted) || invoiceNumber,
      paymentTerms: trim(invoice.notes) || trim(company.conditions) || 'Paiement à l’échéance indiquée.',
      currency: 'EUR'
    };
  }

  global.BastPeppol = Object.freeze({
    trim, amount, escapeXml, country, taxCategory, unitCode,
    groupVat, validateBelgianEndpoints, invoiceLines, prepareInvoiceData
  });
})(globalThis);
