/* BastCompta - moteur pur des cases de declaration TVA. */
(function (global) {
  'use strict';
  function compute({ declaration = {}, sales = [], purchases = [], investments = [], previousCredit = 0, deductiblePurchaseVat = 0, vatExempt = false }) {
    const calc = global.BastAccountingCalculations;
    const round = calc.round2;
    const bases = { '01': 0, '02': 0, '03': 0 };
    let salesVat = 0;
    for (const row of sales) {
      const rate = round(row.rate), base = round(calc.salesNet(row, vatExempt)), vat = round(calc.salesVat(row, vatExempt));
      if (rate === 6) bases['01'] += base; else if (rate === 12) bases['02'] += base; else if (rate === 21) bases['03'] += base;
      salesVat += vat;
    }
    const goods = purchases.reduce((sum, row) => sum + (row.category === 'marchandise' ? calc.number(row.htva) : 0), 0);
    const expenses = purchases.reduce((sum, row) => sum + ((row.category || 'frais_generaux') !== 'marchandise' ? calc.number(row.htva) : 0), 0);
    const investmentVat = investments.reduce((sum, row) => sum + round(calc.vatFromHtva(row.amount, row.rate || 21)), 0);
    const investmentBase = investments.reduce((sum, row) => sum + calc.number(row.amount), 0);
    const manual = declaration.manualBoxes || {};
    const boxes = {
      '01': round(bases['01']), '02': round(bases['02']), '03': round(bases['03']),
      '44': round(manual['44']), '46': round(manual['46']), '47': round(manual['47']), '48': round(manual['48']), '49': round(manual['49']),
      '54': round(salesVat), '55': round(manual['55']), '56': round(manual['56']), '57': round(manual['57']),
      '59': round(deductiblePurchaseVat + investmentVat), '61': round(manual['61']), '62': round(manual['62']), '63': round(manual['63']),
      '71': 0, '72': 0, '81': round(goods), '82': round(expenses), '83': round(investmentBase + calc.number(manual['83'])), '91': round(manual['91'])
    };
    const dueTax = boxes['54'] + boxes['55'] + boxes['56'] + boxes['57'] + boxes['61'];
    const deductible = boxes['59'] + boxes['62'] + boxes['63'] + calc.number(previousCredit);
    const net = round(dueTax - deductible);
    boxes['71'] = net > 0 ? net : 0; boxes['72'] = net < 0 ? Math.abs(net) : 0;
    return { boxes, previousCredit: round(previousCredit), salesCount: sales.length, purchaseCount: purchases.length,
      salesVat: round(salesVat), deductibleVat: boxes['59'], dueAmount: boxes['71'], creditAmount: boxes['72'] };
  }
  function ledger(declarations = [], initialCredit = 0, computeDeclaration) {
    const calc = global.BastAccountingCalculations; let credit = calc.number(initialCredit);
    const rows = declarations.map(declaration => {
      const computed = computeDeclaration(declaration, credit); credit = computed.creditAmount;
      const outstanding = computed.dueAmount > 0 ? calc.round2(Math.max(0, computed.dueAmount - calc.number(declaration.paymentAmount))) : 0;
      return { declaration, computed, outstanding };
    });
    const unfiled = rows.filter(row => !row.declaration.filed), unpaid = rows.filter(row => row.declaration.filed && row.outstanding > 0.009);
    const sum = (items, pick) => calc.round2(items.reduce((total, item) => total + pick(item), 0));
    return { rows, totalDueOpen: sum(rows, row => row.outstanding), totalUnfiledDue: sum(unfiled, row => row.computed.dueAmount),
      totalUnfiledCredit: sum(unfiled, row => row.computed.creditAmount), totalFiledUnpaid: sum(unpaid, row => row.outstanding) };
  }
  global.BastVatDeclaration = Object.freeze({ compute, ledger });
})(globalThis);
