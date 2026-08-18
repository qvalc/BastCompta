/* BastCompta - calculs financiers purs des suivis clients. */
(function (global) {
  'use strict';
  const number = value => Number(value) || 0;
  const sum = values => values.reduce((total, value) => total + number(value), 0);
  const moneyValue = item => number(item?.clientHtva ?? item?.totalClientHtva ?? item?.amount ?? item?.htva);
  const workValue = item => number(item?.workHtva ?? item?.htva ?? item?.amount);
  const supplyCost = item => number(item?.suppliesCost ?? item?.suppliesCostHtva ?? item?.costHtva ?? item?.suppliesHtva);
  const supplySale = item => number(item?.suppliesSaleHtva ?? item?.suppliesHtva);
  function itemYear(item) {
    for (const value of [item?.date, item?.addedAt, item?.modifiedTime, item?.createdAt, item?.updatedAt]) {
      const text = String(value || '').trim(); if (!text) continue;
      const iso = text.match(/^(\d{4})[-/]/); if (iso) return iso[1];
      const local = text.match(/(?:^|\D)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\D|$)/); if (local) return local[3];
    }
    return '';
  }
  const matchesYear = (item, year = 'all') => year === 'all' || itemYear(item) === String(year);
  function totals(project = {}, year = 'all') {
    const invoices = (project.linkedInvoices || []).filter(item => matchesYear(item, year));
    const manualItems = (project.costs || []).filter(item => matchesYear(item, year));
    const invoiceTotal = sum(invoices.map(moneyValue));
    const manualCosts = sum(manualItems.map(moneyValue));
    const invoiceSupplyCosts = sum(invoices.map(supplyCost));
    const costs = manualCosts + invoiceSupplyCosts;
    const margin = invoiceTotal - costs;
    return { invoices: invoiceTotal, costs, margin, marginRate: invoiceTotal > 0 ? margin / invoiceTotal * 100 : 0,
      invoiceWorkTotal: sum(invoices.map(workValue)), invoiceSupplySales: sum(invoices.map(supplySale)),
      manualCosts, invoiceSupplyCosts, quoteAmount: 0, estimatedMargin: margin, remaining: 0 };
  }
  global.BastProjectFinance = Object.freeze({ number, sum, moneyValue, workValue, supplyCost, supplySale, itemYear, matchesYear, totals });
})(globalThis);
