/* BastCompta - synthèse pure des journaux de ventes et d'achats. */
(function (global) {
  'use strict';

  function summarize({ sales = [], purchases = [], vatExempt = false, isPurchaseVatRecoverable } = {}) {
    const calc = global.BastAccountingCalculations;
    const recoverable = typeof isPurchaseVatRecoverable === 'function'
      ? isPurchaseVatRecoverable
      : row => row?.deductible !== false;

    const salesNet = sales.reduce((sum, row) => sum + calc.salesNet(row, vatExempt), 0);
    const salesVat = sales.reduce((sum, row) => sum + calc.salesVat(row, vatExempt), 0);
    const professionalCost = row => calc.purchaseProfessionalCost(row, recoverable(row));
    const purchasesNet = purchases.reduce((sum, row) => sum + professionalCost(row), 0);
    const purchasesMerchandiseNet = purchases.reduce(
      (sum, row) => sum + (row.category === 'marchandise' ? professionalCost(row) : 0),
      0
    );
    const purchasesGeneralNet = purchases.reduce(
      (sum, row) => sum + (row.category === 'frais_generaux' ? professionalCost(row) : 0),
      0
    );

    const vatGroups = new Map();
    purchases.forEach(row => {
      if (!recoverable(row)) return;
      const key = [row.supplier || '', row.invoiceNumber || '', calc.number(row.rate)].join('||');
      const group = vatGroups.get(key) || { htva: 0, rate: calc.number(row.rate) };
      group.htva += calc.number(row.htva);
      vatGroups.set(key, group);
    });
    const purchasesVat = Array.from(vatGroups.values()).reduce(
      (sum, group) => sum + calc.round2(calc.vatFromHtva(group.htva, group.rate)),
      0
    );

    return {
      salesNet: calc.round2(salesNet),
      salesVat: calc.round2(salesVat),
      purchasesNet: calc.round2(purchasesNet),
      purchasesVat: calc.round2(purchasesVat),
      purchasesMerchandiseNet: calc.round2(purchasesMerchandiseNet),
      purchasesGeneralNet: calc.round2(purchasesGeneralNet)
    };
  }

  global.BastAccountingJournals = Object.freeze({ summarize });
})(globalThis);
