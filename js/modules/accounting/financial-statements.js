/* BastCompta - synthese pure du resultat et du bilan simplifie. */
(function (global) {
  'use strict';
  function summarize(input = {}) {
    const calc = global.BastAccountingCalculations, n = calc.number, round = calc.round2;
    const privateMovementsNet = (input.privateMovements || []).reduce((sum, row) => {
      const amount = Math.abs(n(row.amount));
      return sum + (['withdrawal', 'regularization'].includes(row.type || 'withdrawal') ? -amount : amount);
    }, 0);
    const ownerAccountBalance = round(n(input.ownerAccountCarryover) + privateMovementsNet);
    const totalCharges = n(input.purchasesNet) + n(input.yearlyAmort) + n(input.otherTaxesTotal)
      + n(input.financialChargesTotal) + n(input.exceptionalChargesTotal);
    const estimatedProfit = n(input.salesNet) - totalCharges;
    const threshold = n(input.socialExemptionThreshold || 1881.76);
    const exempt = estimatedProfit <= threshold;
    const deductibleSocialContributions = Math.max(0, n(input.socialContributionsTotal));
    const excessSocialRefund = Math.max(0, -n(input.socialContributionsTotal));
    const socialContributionRecovered = exempt ? deductibleSocialContributions : 0;
    const socialBase = exempt ? 0 : estimatedProfit * n(input.socialContributionRate || 20.5) / 100;
    const socialContributionDue = socialBase + socialBase * n(input.socialContributionFeeRate || 3.5) / 100;
    const netFixedAssets = n(input.assetsGross) - n(input.totalAmortized);
    const liquidities = n(input.bankBalance) + n(input.cashBalance);
    const receivableVat = n(input.openVatCredit), payableVat = n(input.openVatDue);
    const assetsSide = netFixedAssets + n(input.stockValue) + receivableVat + liquidities;
    const liabilitiesSide = n(input.capitalStart) + n(input.retainedEarnings) + ownerAccountBalance + estimatedProfit + payableVat;
    return { privateMovementsNet, ownerAccountBalance, totalCharges, estimatedProfit,
      deductibleSocialContributions, excessSocialRefund, socialContributionRecovered, socialContributionDue,
      taxableEstimatedProfit: estimatedProfit, netFixedAssets, liquidities, receivableVat, payableVat,
      realVat: round(payableVat - receivableVat), assetsSide, liabilitiesSide };
  }
  global.BastFinancialStatements = Object.freeze({ summarize });
})(globalThis);
