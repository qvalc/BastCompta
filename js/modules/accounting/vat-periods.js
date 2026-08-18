/* BastCompta - periodes et echeances des declarations TVA trimestrielles. */
(function (global) {
  'use strict';
  const manualBoxCodes = Object.freeze(['44','46','47','48','49','55','56','57','61','62','63','83','91']);
  function dateLocal(date) {
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  }
  const validQuarter = quarter => Math.min(4, Math.max(1, parseInt(quarter || 1, 10) || 1));
  function bounds(year, quarter) {
    const y = parseInt(year, 10) || new Date().getFullYear(), q = validQuarter(quarter), month = (q - 1) * 3;
    return { start: dateLocal(new Date(y, month, 1)), end: dateLocal(new Date(y, month + 3, 0)) };
  }
  function nextBusinessDay(value) {
    const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
    return date;
  }
  function dueDate(year, quarter) {
    const y = parseInt(year, 10) || new Date().getFullYear(), q = validQuarter(quarter);
    return dateLocal(nextBusinessDay(new Date(y, q * 3, 25)));
  }
  const label = (year, quarter) => `T${quarter || 1} ${year || ''}`.trim();
  function template(year, quarter, createId = () => '') {
    const y = parseInt(year, 10) || new Date().getFullYear(), q = validQuarter(quarter), period = bounds(y, q);
    return { id: createId(), regime: 'quarterly', year: y, quarter: q, dueDate: dueDate(y, q),
      startDate: period.start, endDate: period.end, filed: false, filedDate: '', paid: false, paidDate: '',
      paymentAmount: 0, reimbursementRequested: false, closed: false, notes: '',
      manualBoxes: Object.fromEntries(manualBoxCodes.map(code => [code, 0])) };
  }
  function ensureDeclaration(declaration = {}) {
    const period = bounds(declaration.year, declaration.quarter);
    declaration.startDate = period.start; declaration.endDate = period.end;
    declaration.dueDate ||= dueDate(declaration.year, declaration.quarter);
    declaration.manualBoxes = declaration.manualBoxes && typeof declaration.manualBoxes === 'object' ? declaration.manualBoxes : {};
    for (const code of manualBoxCodes) declaration.manualBoxes[code] ??= 0;
    declaration.closed ??= false; declaration.filed ??= false; declaration.paid ??= false;
    declaration.paymentAmount ??= 0; declaration.reimbursementRequested ??= false;
    return declaration;
  }
  global.BastVatPeriods = Object.freeze({ manualBoxCodes, dateLocal, validQuarter, bounds, nextBusinessDay, dueDate, label, template, ensureDeclaration });
})(globalThis);
