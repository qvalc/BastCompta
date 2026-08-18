/* BastCompta - calculs fiscaux IPP purs. */
(function (global) {
  'use strict';
  const number = value => Number(value) || 0;
  const round2 = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
  function amortization(amount, date, durationMonths, year) {
    amount = number(amount); const duration = Math.max(1, parseInt(durationMonths || 60, 10));
    const start = String(date || '').slice(0, 10), purchase = new Date(`${start}T00:00:00`);
    if (!start || Number.isNaN(purchase.getTime())) return { amortYear: 0, amortTotal: 0, netValue: amount };
    const purchaseYear = purchase.getFullYear(), purchaseMonth = purchase.getMonth() + 1;
    const firstYear = purchaseMonth === 12 ? purchaseYear + 1 : purchaseYear;
    const firstMonth = purchaseMonth === 12 ? 1 : purchaseMonth + 1;
    if (year < firstYear) return { amortYear: 0, amortTotal: 0, netValue: amount };
    const monthly = amount / duration;
    const totalMonths = Math.max(0, Math.min(duration, (year - firstYear) * 12 + (12 - firstMonth + 1)));
    const amortTotal = round2(monthly * totalMonths);
    const beforeYear = year === firstYear ? 0 : (year - firstYear) * 12 - (firstMonth - 1);
    const monthsInYear = year === firstYear ? 12 - firstMonth + 1 : Math.min(12, Math.max(0, duration - beforeYear));
    return { amortYear: round2(monthly * Math.max(0, Math.min(duration, monthsInYear))), amortTotal,
      netValue: round2(Math.max(0, amount - amortTotal)) };
  }
  function estimatedSocialContribution(profit, settings = {}) {
    const threshold = number(settings.threshold || 1881.76), rate = number(settings.rate || 20.5), feeRate = number(settings.feeRate || 3.5);
    if (profit <= threshold) return 0;
    const contribution = profit * rate / 100;
    return round2(contribution + contribution * feeRate / 100);
  }
  function fiscalResult(input = {}) {
    const share = Math.max(0, Math.min(100, number(input.professionalShare ?? 100))) / 100;
    const rawCosts = number(input.purchasesNet) + number(input.lossesTotal) + number(input.yearlyAmort)
      + number(input.kmFiscal) + number(input.extraManualCosts);
    const fiscalCosts = round2(rawCosts * share);
    const profitBeforeSocial = round2(number(input.salesNet) - fiscalCosts - number(input.plci) - number(input.priorLosses));
    const social = number(input.socialContributions), threshold = number(input.socialExemptionThreshold || 1881.76);
    const exemptedSocial = profitBeforeSocial <= threshold ? social : 0;
    return { rawCosts, fiscalCosts, profitBeforeSocial, exemptedSocial,
      taxableProfit: round2(profitBeforeSocial - social + exemptedSocial) };
  }
  global.BastTaxCalculations = Object.freeze({ number, round2, amortization, estimatedSocialContribution, fiscalResult });
})(globalThis);
