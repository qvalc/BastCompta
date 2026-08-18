/* BastCompta - calculs purs du module Personnel. */
(function (global) {
  'use strict';
  const number = value => Number(String(value ?? '').replace(',', '.')) || 0;
  const recordYear = item => String(item?.date || item?.startDate || item?.month || '').slice(0, 4);
  function daysInclusive(start, end) {
    if (!start) return 0;
    const first = new Date(`${start}T00:00:00`), last = new Date(`${end || start}T00:00:00`);
    if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return 0;
    return Math.max(1, Math.round((last - first) / 86400000) + 1);
  }
  const salaryCost = salary => number(salary?.gross) + number(salary?.employerCharges)
    + number(salary?.mealVouchers) + number(salary?.benefits) + number(salary?.reimbursements);
  const bonusCost = bonus => number(bonus?.amount) + number(bonus?.employerCharges);
  const activeOn = (record, date) => !!record?.startDate && record.startDate <= date && (!record.endDate || record.endDate >= date);
  const isCurrentAbsence = (absence, date) => activeOn(absence, date);
  const isCurrentLeave = (leave, date) => leave?.status !== 'cancelled' && leave?.status !== 'requested' && activeOn(leave, date);
  function usedLegalLeave(worker, year = 'all') {
    return (worker?.leaves || []).filter(leave => (year === 'all' || recordYear(leave) === String(year))
      && leave.type === 'legal' && leave.status !== 'cancelled')
      .reduce((total, leave) => total + (number(leave.days) || daysInclusive(leave.startDate, leave.endDate)), 0);
  }
  function currentState(worker, date) {
    if (!worker?.active) return 'inactive';
    const absence = (worker.absences || []).find(item => isCurrentAbsence(item, date));
    if (absence) return absence.type === 'illness' ? 'illness' : 'other';
    if ((worker.leaves || []).some(item => isCurrentLeave(item, date))) return 'leave';
    return 'active';
  }
  global.BastPersonnelCalculations = Object.freeze({ number, recordYear, daysInclusive, salaryCost, bonusCost,
    activeOn, isCurrentAbsence, isCurrentLeave, usedLegalLeave, currentState });
})(globalThis);
