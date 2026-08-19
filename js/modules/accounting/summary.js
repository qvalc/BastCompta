/* BastCompta - assemblage pur de la synthèse comptable complète. */
(function (global) {
  'use strict';

  function summarize({
    data = {},
    currentYear = new Date().getFullYear(),
    vatExempt = false,
    isPurchaseVatRecoverable,
    vatLedger = null
  } = {}) {
    const calc = global.BastAccountingCalculations;
    const settings = data.settings || {};
    const journal = global.BastAccountingJournals.summarize({
      sales: data.sales || [],
      purchases: data.purchases || [],
      vatExempt,
      isPurchaseVatRecoverable
    });
    const fixedAssets = global.BastFixedAssets.summarize({
      investments: data.investments || [],
      assets: data.assets || [],
      currentYear
    });
    const operating = global.BastOperatingLedger.summarize({
      stock: data.stock || [],
      losses: data.losses || [],
      km: data.km || [],
      privateMovements: data.privateMovements || []
    });
    const ownerAccountCarryover = calc.number(settings.ownerAccountCarryover);
    const vatPosition = global.BastVatDeclaration.openPosition({
      vatLedger,
      initialCredit: calc.number(settings.vatCarryover),
      salesVat: journal.salesVat,
      purchasesVat: journal.purchasesVat,
      vatExempt
    });
    const statement = global.BastFinancialStatements.summarize({
      salesNet: journal.salesNet,
      purchasesNet: journal.purchasesNet,
      yearlyAmort: fixedAssets.investmentsYearlyAmort,
      otherTaxesTotal: operating.otherTaxesTotal,
      financialChargesTotal: operating.financialChargesTotal,
      exceptionalChargesTotal: operating.exceptionalChargesTotal,
      socialContributionsTotal: operating.socialContributionsTotal,
      assetsGross: fixedAssets.assetsGross,
      totalAmortized: fixedAssets.assetsTotalAmortized,
      stockValue: operating.stockValue,
      privateMovements: data.privateMovements || [],
      ownerAccountCarryover,
      socialExemptionThreshold: settings.socialExemptionThreshold,
      socialContributionRate: settings.socialContributionRate,
      socialContributionFeeRate: settings.socialContributionFeeRate,
      bankBalance: settings.bankBalance,
      cashBalance: settings.cashBalance,
      capitalStart: settings.capitalStart,
      retainedEarnings: settings.retainedEarnings,
      openVatCredit: vatPosition.openVatCredit,
      openVatDue: vatPosition.openVatDue
    });

    return {
      ...journal,
      investmentComputed: fixedAssets.investmentComputed,
      assetsComputed: fixedAssets.assetsComputed,
      assetsGross: fixedAssets.assetsGross,
      yearlyAmort: fixedAssets.investmentsYearlyAmort,
      totalAmortized: fixedAssets.assetsTotalAmortized,
      stockValue: operating.stockValue,
      lossesTotal: operating.lossesTotal,
      socialContributionsTotal: operating.socialContributionsTotal,
      otherTaxesTotal: operating.otherTaxesTotal,
      financialChargesTotal: operating.financialChargesTotal,
      exceptionalChargesTotal: operating.exceptionalChargesTotal,
      kmTotal: operating.kmTotal,
      ownerAccountCarryover,
      ...statement,
      netVat: vatPosition.netVat,
      realVat: statement.realVat
    };
  }

  global.BastAccountingSummary = Object.freeze({ summarize });
})(globalThis);
