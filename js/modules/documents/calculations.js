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

  function invoiceStatus(totalValue, paidValue, tolerance = 0.009) {
    const total = number(totalValue);
    const paid = number(paidValue);
    const margin = Math.abs(number(tolerance));
    if (total < -margin) return 'credit_note';
    if (total > margin && paid > total + margin) return 'overpaid';
    if (total > margin && Math.abs(paid - total) <= margin) return 'paid';
    if (total > margin && paid > margin) return 'partial';
    return 'unpaid';
  }

  function paymentBalance(totalValue, paidValue) {
    return number(totalValue) - number(paidValue);
  }

  function roundMoney(value) {
    return Math.round((number(value) + Number.EPSILON) * 100) / 100;
  }

  function invoiceAccountingPayload(invoice = {}, status) {
    const documentStatus = status || invoiceStatus(totalsForDocument(invoice).tvac, invoice.paidAmount);
    const invoiceNumber = String(invoice.documentNumber || '').trim();
    const mainLines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const suppliesLines = invoice.suppliesEnabled && Array.isArray(invoice.suppliesLines)
      ? invoice.suppliesLines
      : [];
    const lines = [...mainLines, ...suppliesLines].filter(row => {
      return String(row.description || '').trim() || number(row.qty) || number(row.unitPrice);
    });

    if (!lines.length) return { rows: [], message: 'La facture ne contient aucune ligne.' };

    const grouped = new Map();
    lines.forEach(row => {
      const rate = roundMoney(row.vatRate);
      const key = String(rate);
      if (!grouped.has(key)) grouped.set(key, { rate, tvac: 0 });
      grouped.get(key).tvac += lineTvac(row);
    });

    const isCreditNote = documentStatus === 'credit_note';
    const linkedInvoiceNumber = invoice.linkedInvoiceNumber || '';
    const rows = Array.from(grouped.values()).map(group => ({
      date: invoice.date || '',
      client: invoice.clientName || '',
      invoiceNumber,
      linkedInvoiceNumber,
      documentStatus,
      documentType: isCreditNote ? 'credit_note' : 'invoice',
      description: isCreditNote
        ? `Note de crédit${linkedInvoiceNumber ? ' liée à ' + linkedInvoiceNumber : ''}`
        : '',
      rate: group.rate,
      tvac: isCreditNote ? -Math.abs(roundMoney(group.tvac)) : roundMoney(group.tvac)
    }));

    return {
      action: 'upsert',
      documentType: isCreditNote ? 'credit_note' : 'invoice',
      documentStatus,
      invoiceNumber,
      linkedInvoiceNumber,
      rows,
      message: `${rows.length} ligne(s) prête(s) pour la comptabilité.`
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
    totalsForDocument, invoiceStatus, paymentBalance, invoiceAccountingPayload,
    normalizeClientNumber, normalizeYear, normalizeInvoiceNumber,
    structuredCommunication, normalizeVatNumber, belgianEnterpriseNumber,
    isValidBelgianEnterpriseNumber
  });
})(globalThis);
