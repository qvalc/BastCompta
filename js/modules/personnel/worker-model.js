(function (global) {
  'use strict';
  const number = value => Number(String(value ?? '').replace(',', '.')) || 0;
  const arrays = Object.freeze(['salaries','bonuses','leaves','absences','timeEntries','documents','trainings','equipment','history']);
  function normalize(worker = {}, createId = () => '') {
    const result = { id: worker.id || createId(), firstName: worker.firstName || '', lastName: worker.lastName || '',
      type: worker.type || 'worker', active: worker.active !== false, birthDate: worker.birthDate || '', nationalNumber: worker.nationalNumber || '',
      address: worker.address || '', phone: worker.phone || '', email: worker.email || '', emergencyContact: worker.emergencyContact || '',
      functionTitle: worker.functionTitle || '', department: worker.department || '', jointCommittee: worker.jointCommittee || '',
      contractType: worker.contractType || 'CDI', startDate: worker.startDate || '', endDate: worker.endDate || '',
      workRegime: worker.workRegime || 'Temps plein', weeklyHours: number(worker.weeklyHours) || 38,
      wageType: worker.wageType || 'monthly', baseWage: number(worker.baseWage), annualLeaveDays: number(worker.annualLeaveDays) || 20,
      iban: worker.iban || '', notes: worker.notes || '' };
    for (const field of arrays) result[field] = Array.isArray(worker[field]) ? worker[field] : [];
    return result;
  }
  function normalizeData(source, options = {}) {
    const data = { version: 1, updatedAt: options.now?.() || new Date().toISOString(), ...(source && typeof source === 'object' ? source : {}) };
    data.workers = (Array.isArray(data.workers) ? data.workers : []).map(worker => normalize(worker, options.createId));
    return data;
  }
  global.BastWorkerModel = Object.freeze({ arrays, normalize, normalizeData });
})(globalThis);
