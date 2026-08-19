/* BastCompta - calculs comptables purs. */
(function (global) {
  'use strict';
  const number = value => { const parsed = parseFloat(value); return Number.isFinite(parsed) ? parsed : 0; };
  const round2 = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
  const netFromTvac = (tvac, rate) => number(tvac) / (1 + number(rate) / 100);
  const vatFromTvac = (tvac, rate) => number(tvac) - netFromTvac(tvac, rate);
  const vatFromHtva = (htva, rate) => number(htva) * number(rate) / 100;
  const tvacFromHtva = (htva, rate) => number(htva) + vatFromHtva(htva, rate);
  const isCreditNote = row => String(row?.documentType || '').toLowerCase() === 'credit_note'
    || String(row?.documentStatus || '').toLowerCase() === 'credit_note'
    || /note\s+de\s+cr[eé]dit/i.test(String(row?.description || ''));
  const signedSalesTvac = row => isCreditNote(row) ? -Math.abs(number(row?.tvac)) : number(row?.tvac);
  const salesNet = (row, vatExempt = false) => vatExempt ? signedSalesTvac(row) : netFromTvac(signedSalesTvac(row), row?.rate);
  const salesVat = (row, vatExempt = false) => vatExempt ? 0 : vatFromTvac(signedSalesTvac(row), row?.rate);
  const purchaseVat = row => round2(vatFromHtva(row?.htva, row?.rate));
  const purchaseProfessionalCost = (row, vatRecoverable = true) => round2(number(row?.htva) + (vatRecoverable ? 0 : purchaseVat(row)));

  function purchaseVatGroupKey(row = {}) {
    return [
      row.supplier || '',
      row.invoiceNumber || '',
      number(row.rate),
      row.deductible ? '1' : '0'
    ].join('||');
  }

  function allocatedPurchaseVat(purchases = [], index) {
    const row = purchases[index];
    if (!row || !row.deductible) return 0;

    const key = purchaseVatGroupKey(row);
    const groupIndexes = purchases
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item }) => purchaseVatGroupKey(item) === key)
      .map(({ itemIndex }) => itemIndex);

    if (groupIndexes.length <= 1 || !row.invoiceNumber) return purchaseVat(row);

    const groupHtva = groupIndexes.reduce((sum, itemIndex) => sum + number(purchases[itemIndex].htva), 0);
    const groupVat = round2(vatFromHtva(groupHtva, row.rate));
    let allocatedBefore = 0;

    for (let position = 0; position < groupIndexes.length; position += 1) {
      const itemIndex = groupIndexes[position];
      if (position === groupIndexes.length - 1) {
        const remainder = round2(groupVat - allocatedBefore);
        if (itemIndex === index) return remainder;
        continue;
      }

      const lineVat = groupHtva === 0
        ? 0
        : round2(groupVat * (number(purchases[itemIndex].htva) / groupHtva));
      if (itemIndex === index) return lineVat;
      allocatedBefore += lineVat;
    }

    return 0;
  }

  function amortization(amount, startDate, durationMonths, currentYear) {
    const safeAmount = number(amount), duration = Math.max(1, parseInt(durationMonths || 0, 10) || 1);
    const monthlyAmort = safeAmount / duration;
    const empty = () => ({ amortYear: 0, amortTotal: 0, netValue: safeAmount, monthlyAmort });
    if (!startDate) return empty();
    const date = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return empty();
    const purchaseYear = date.getFullYear(), purchaseMonth = date.getMonth() + 1;
    const firstYear = purchaseMonth === 12 ? purchaseYear + 1 : purchaseYear;
    const firstMonth = purchaseMonth === 12 ? 1 : purchaseMonth + 1;
    let amortYear = 0, amortTotal = 0;
    if (currentYear >= firstYear) {
      const monthsToYearEnd = (currentYear - firstYear) * 12 + (12 - firstMonth + 1);
      const used = Math.max(0, Math.min(duration, monthsToYearEnd));
      amortTotal = Math.min(safeAmount, monthlyAmort * used);
      if (currentYear === firstYear) amortYear = Math.min(safeAmount, monthlyAmort * Math.min(duration, 12 - firstMonth + 1));
      else {
        const before = Math.max(0, Math.min(duration, (currentYear - firstYear - 1) * 12 + (12 - firstMonth + 1)));
        amortYear = Math.min(safeAmount, monthlyAmort * Math.min(12, Math.max(0, duration - before)));
      }
    }
    return { amortYear, amortTotal, netValue: Math.max(0, safeAmount - amortTotal), monthlyAmort };
  }

  global.BastAccountingCalculations = Object.freeze({ number, round2, netFromTvac, vatFromTvac, vatFromHtva, tvacFromHtva,
    isCreditNote, signedSalesTvac, salesNet, salesVat, purchaseVat, purchaseProfessionalCost,
    purchaseVatGroupKey, allocatedPurchaseVat, amortization });
})(globalThis);
