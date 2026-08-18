/* BastCompta - calculs purs des documents commerciaux. */
(function (global) {
  'use strict';

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

  function lineBase(row = {}) { return number(row.qty) * number(row.unitPrice); }
  function lineDiscountAmount(row = {}) { return lineBase(row) * number(row.discount) / 100; }
  function lineNet(row = {}) { return lineBase(row) - lineDiscountAmount(row); }
  function lineVat(row = {}) { return lineNet(row) * number(row.vatRate) / 100; }
  function lineTvac(row = {}) { return lineNet(row) + lineVat(row); }
  function lineCost(row = {}) {
    const costPrice = row.costPrice ?? row.purchasePrice ?? row.cost ?? row.unitPrice ?? 0;
    return number(row.qty) * number(costPrice);
  }
  function lineSupplyMargin(row = {}) { return lineNet(row) - lineCost(row); }

  function totalsForDocument(doc = {}) {
    const work = Array.isArray(doc.lines) ? doc.lines : [];
    const supplies = doc.suppliesEnabled && Array.isArray(doc.suppliesLines) ? doc.suppliesLines : [];
    const sum = (rows, calculate) => rows.reduce((total, row) => total + calculate(row), 0);
    const workHtva = sum(work, lineNet);
    const workVat = sum(work, lineVat);
    const suppliesSaleHtva = sum(supplies, lineNet);
    const suppliesVat = sum(supplies, lineVat);
    const suppliesCostHtva = sum(supplies, lineCost);
    const htva = workHtva + suppliesSaleHtva;
    const vat = workVat + suppliesVat;
    return {
      htva, vat, tvac: htva + vat,
      workHtva, workVat, workTvac: workHtva + workVat,
      suppliesSaleHtva, suppliesHtva: suppliesSaleHtva,
      suppliesVat, suppliesTvac: suppliesSaleHtva + suppliesVat,
      suppliesCostHtva
    };
  }

  function normalizeClientNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 3) return digits;
    if (digits.length <= 2) return (`1${digits}`).slice(0, 3);
    return digits.slice(0, 3);
  }
  const normalizeYear = value => String(value || '').replace(/\D/g, '').slice(0, 4);
  const normalizeInvoiceNumber = value => String(value || '').replace(/\D/g, '').slice(0, 2);

  function structuredCommunication(clientNumber, invoiceYear, invoiceNumber) {
    const client = normalizeClientNumber(clientNumber);
    const year = normalizeYear(invoiceYear);
    const invoice = normalizeInvoiceNumber(invoiceNumber);
    if (!client || year.length !== 4 || !invoice) return { base: '', control: '', formatted: '+++...+++' };
    const base = `${client}${year}${invoice}`;
    const modulo = Number(base) % 97;
    const control = String(modulo === 0 ? 97 : modulo).padStart(2, '0');
    return { base, control, formatted: `+++${client}/${year}/${invoice}${control}+++` };
  }

  const normalizeVatNumber = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  function belgianEnterpriseNumber(value) {
    const digits = normalizeVatNumber(value).replace(/\D/g, '');
    return digits.length === 10 ? digits : '';
  }
  function isValidBelgianEnterpriseNumber(value) {
    const enterprise = belgianEnterpriseNumber(value);
    if (!enterprise) return false;
    return Number(enterprise.slice(8)) === 97 - (Number(enterprise.slice(0, 8)) % 97);
  }

  global.BastDocumentCalculations = Object.freeze({
    lineBase, lineDiscountAmount, lineNet, lineVat, lineTvac, lineCost, lineSupplyMargin,
    totalsForDocument, normalizeClientNumber, normalizeYear, normalizeInvoiceNumber,
    structuredCommunication, normalizeVatNumber, belgianEnterpriseNumber,
    isValidBelgianEnterpriseNumber
  });
})(globalThis);
