/* BastCompta - préparation pure des données du rapport comptable. */
(function (global) {
  'use strict';

  function build({ data = {}, summary = {}, vatLedger = {}, vatExempt = false, purchaseVatAt, format = {} } = {}) {
    const calc = global.BastAccountingCalculations;
    const operating = global.BastOperatingLedger;
    const date = format.date || (value => String(value || '—'));
    const escape = format.escape || (value => String(value ?? ''));
    const money = format.money || (value => value);
    const num = format.num || (value => value);
    const quarter = format.quarter || ((year, quarterNumber) => `${year} T${quarterNumber}`);
    const lossTypeLabel = format.lossTypeLabel || (type => type);
    const privateMovementTypeLabel = format.privateMovementTypeLabel || (type => type || 'withdrawal');
    const settings = data.settings || {};

    const vatRows = (vatLedger.rows || []).flatMap(row => [
      [`${quarter(row.declaration.year, row.declaration.quarter)} – période`, `${date(row.computed.startDate)} au ${date(row.computed.endDate)}`],
      [`${quarter(row.declaration.year, row.declaration.quarter)} – échéance`, date(row.declaration.dueDate || '')],
      [`${quarter(row.declaration.year, row.declaration.quarter)} – grille 54`, money(row.computed.boxes['54'])],
      [`${quarter(row.declaration.year, row.declaration.quarter)} – grille 59`, money(row.computed.boxes['59'])],
      [`${quarter(row.declaration.year, row.declaration.quarter)} – grille 71`, money(row.computed.boxes['71'])],
      [`${quarter(row.declaration.year, row.declaration.quarter)} – grille 72`, money(row.computed.boxes['72'])],
      [`${quarter(row.declaration.year, row.declaration.quarter)} – reste à payer`, money(row.outstanding)]
    ]);
    const salesRows = (data.sales || []).map(row => [
      date(row.date), escape(row.client || '—'), escape(row.invoiceNumber || '—'), escape(row.description || '—'),
      `${num(row.rate)} %`, money(calc.salesNet(row, vatExempt)), money(calc.salesVat(row, vatExempt)), money(calc.signedSalesTvac(row))
    ]);
    const purchaseRows = (data.purchases || []).map((row, index) => [
      date(row.date), escape(row.supplier || '—'), escape(row.invoiceNumber || '—'),
      escape(row.category === 'marchandise' ? 'Marchandise' : 'Frais généraux'), `${num(row.rate)} %`, money(row.htva),
      row.deductible ? 'Oui' : 'Non', money(row.deductible ? purchaseVatAt(index) : 0), money(calc.tvacFromHtva(row.htva, row.rate))
    ]);
    const investmentRows = (summary.investmentComputed || []).map(row => [
      date(row.date), escape(row.supplier || '—'), escape(row.invoiceNumber || '—'), escape(row.description || row.label || '—'),
      money(row.amount), `${parseInt(row.durationMonths || 0, 10)} mois`, money(row.amortYear), money(row.amortTotal), money(row.netValue)
    ]);
    const assetRows = (summary.assetsComputed || []).map(row => [
      date(row.date), escape(row.label || '—'), escape(row.supplier || '—'), money(row.amount),
      `${parseInt(row.durationMonths || 0, 10)} mois`, money(row.amortYear), money(row.amortTotal), money(row.netValue)
    ]);
    const stockRows = (data.stock || []).map(row => [
      escape(row.label || '—'), num(row.quantity), money(row.unitPrice), money(operating.rowAmount(row))
    ]);
    const lossRows = (data.losses || []).map(row => [
      date(row.date), escape(lossTypeLabel(operating.lossType(row))), escape(row.label || '—'),
      num(row.quantity), money(row.unitPrice), money(operating.rowAmount(row))
    ]);
    const privateMovementRows = (data.privateMovements || []).map(row => {
      const amount = Math.abs(calc.number(row.amount));
      return [escape(row.date || '—'), escape(privateMovementTypeLabel(row.type)), escape(row.label || '—'),
        money(amount), money(operating.privateMovementEffect(row))];
    });
    const kmRows = (data.km || []).map(row => [
      date(row.date), escape(row.person || '—'), escape(row.route || '—'), `${num(row.km)} km`, num(row.trips),
      `${num(calc.number(row.km) * calc.number(row.trips))} km`
    ]);

    const exemptionThreshold = calc.number(settings.socialExemptionThreshold || 1881.76);
    const contributionRate = calc.number(settings.socialContributionRate || 20.5);
    const contributionFeeRate = calc.number(settings.socialContributionFeeRate || 3.5);
    const isExemptSocial = calc.number(summary.estimatedProfit) <= exemptionThreshold;
    const socialBaseContribution = isExemptSocial ? 0 : calc.number(summary.estimatedProfit) * contributionRate / 100;
    const socialFeeContribution = isExemptSocial ? 0 : socialBaseContribution * contributionFeeRate / 100;

    return { vatRows, salesRows, purchaseRows, investmentRows, assetRows, stockRows, lossRows, privateMovementRows, kmRows,
      exemptionThreshold, contributionRate, contributionFeeRate, isExemptSocial, socialBaseContribution,
      socialFeeContribution, socialTotalContribution: socialBaseContribution + socialFeeContribution };
  }

  global.BastAccountingReportData = Object.freeze({ build });
})(globalThis);
