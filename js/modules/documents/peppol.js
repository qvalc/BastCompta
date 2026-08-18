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

  global.BastPeppol = Object.freeze({ trim, amount, escapeXml, country, taxCategory, unitCode, groupVat, validateBelgianEndpoints });
})(globalThis);
