/* BastCompta - création pure d'un nouvel exercice comptable. */
(function (global) {
  'use strict';

  const clone = value => structuredClone(value);

  function validateYear(value) {
    const year = String(value || '').trim();
    if (!/^\d{4}$/.test(year)) throw new Error('Année invalide.');
    return year;
  }

  function mergeSettings(defaultSettings = {}, currentSettings = {}) {
    const result = clone(defaultSettings || {});
    Object.entries(currentSettings || {}).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)
        && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = mergeSettings(result[key], value);
      } else {
        result[key] = clone(value);
      }
    });
    return result;
  }

  function fileName(sourceData = {}) {
    const period = String(sourceData.company?.period || '').trim();
    const company = String(sourceData.company?.name || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (period && company) return `comptabilite-${company}-${period}.json`;
    if (period) return `comptabilite-${period}.json`;
    if (company) return `comptabilite-${company}.json`;
    return 'comptabilite-export.json';
  }

  function createNext({ currentData = {}, defaults = {}, totals = {}, targetYear } = {}) {
    const calc = global.BastAccountingCalculations;
    const year = validateYear(targetYear);
    const nextData = clone(defaults);
    const settings = mergeSettings(defaults.settings || {}, currentData.settings || {});

    nextData.company = {
      name: currentData.company?.name || '',
      period: year,
      notes: currentData.company?.notes || ''
    };
    nextData.stock = clone(Array.isArray(currentData.stock) ? currentData.stock : []);
    nextData.assets = clone(Array.isArray(currentData.assets) ? currentData.assets : []);
    nextData.investments = clone(Array.isArray(currentData.investments) ? currentData.investments : []);
    nextData.settings = settings;
    nextData.settings.retainedEarnings = calc.round2(calc.number(settings.retainedEarnings) + calc.number(totals.estimatedProfit));
    nextData.settings.vatCarryover = Math.max(0, calc.round2(calc.number(totals.receivableVat)));
    nextData.settings.ownerAccountCarryover = calc.round2(calc.number(totals.ownerAccountBalance));
    nextData.purchases = [];
    nextData.sales = [];
    nextData.losses = [];
    nextData.km = [];
    nextData.privateMovements = [];
    nextData.vat = { declarations: [] };
    return nextData;
  }

  global.BastAccountingExercise = Object.freeze({ validateYear, mergeSettings, fileName, createNext });
})(globalThis);
