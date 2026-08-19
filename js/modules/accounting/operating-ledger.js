/* BastCompta - agrégations pures du stock, des charges et des mouvements privés. */
(function (global) {
  'use strict';

  const SPECIAL_LOSS_TYPES = Object.freeze([
    'cotisations_sociales',
    'frais_financiers',
    'charges_exceptionnelles'
  ]);

  const lossType = row => row?.type || 'cotisations_sociales';
  const rowAmount = row => global.BastAccountingCalculations.number(row?.quantity)
    * global.BastAccountingCalculations.number(row?.unitPrice);

  function privateMovementEffect(row = {}) {
    const amount = Math.abs(global.BastAccountingCalculations.number(row.amount));
    return ['withdrawal', 'regularization'].includes(row.type || 'withdrawal') ? -amount : amount;
  }

  function summarize({ stock = [], losses = [], km = [], privateMovements = [] } = {}) {
    const calc = global.BastAccountingCalculations;
    const stockValue = stock.reduce((sum, row) => sum + rowAmount(row), 0);
    const lossesTotal = losses.reduce((sum, row) => sum + rowAmount(row), 0);
    const totalByType = type => losses.reduce(
      (sum, row) => sum + (lossType(row) === type ? rowAmount(row) : 0),
      0
    );
    const otherTaxesTotal = losses.reduce((sum, row) => {
      return sum + (SPECIAL_LOSS_TYPES.includes(lossType(row)) ? 0 : rowAmount(row));
    }, 0);
    const kmTotal = km.reduce(
      (sum, row) => sum + calc.number(row.km) * calc.number(row.trips || 1),
      0
    );
    const withdrawals = privateMovements.reduce((sum, row) => {
      return sum + ((row.type || 'withdrawal') === 'withdrawal' ? Math.abs(calc.number(row.amount)) : 0);
    }, 0);
    const regularizations = privateMovements.reduce((sum, row) => {
      return sum + ((row.type || 'withdrawal') === 'regularization' ? Math.abs(calc.number(row.amount)) : 0);
    }, 0);
    const additions = privateMovements.reduce((sum, row) => {
      return sum + (['contribution', 'reimbursement'].includes(row.type || 'withdrawal') ? Math.abs(calc.number(row.amount)) : 0);
    }, 0);

    return {
      stockValue,
      lossesTotal,
      socialContributionsTotal: totalByType('cotisations_sociales'),
      financialChargesTotal: totalByType('frais_financiers'),
      exceptionalChargesTotal: totalByType('charges_exceptionnelles'),
      otherTaxesTotal,
      kmTotal,
      withdrawals,
      regularizations,
      additions,
      privateMovementsNet: privateMovements.reduce((sum, row) => sum + privateMovementEffect(row), 0)
    };
  }

  global.BastOperatingLedger = Object.freeze({ SPECIAL_LOSS_TYPES, lossType, rowAmount, privateMovementEffect, summarize });
})(globalThis);
