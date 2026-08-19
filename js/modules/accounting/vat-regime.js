/* BastCompta - règles métier pures des régimes TVA. */
(function (global) {
  'use strict';

  const DEFAULT_REGIME = 'taxable';
  const LABELS = Object.freeze({
    taxable: 'Assujetti TVA',
    mixed: 'Assujetti mixte',
    exempt_article_44: 'Exonéré TVA – article 44'
  });

  const get = settings => settings?.vatRegime || DEFAULT_REGIME;
  const isExempt = regime => (regime || DEFAULT_REGIME) === 'exempt_article_44';
  const isMixed = regime => (regime || DEFAULT_REGIME) === 'mixed';
  const label = regime => LABELS[regime || DEFAULT_REGIME] || LABELS[DEFAULT_REGIME];

  function hasEntries(accountingData = {}) {
    return [
      accountingData.sales,
      accountingData.purchases,
      accountingData.investments,
      accountingData.assets,
      accountingData.stock,
      accountingData.losses,
      accountingData.km,
      accountingData.privateMovements,
      accountingData.vat?.declarations
    ].some(rows => Array.isArray(rows) && rows.length > 0);
  }

  function applyRules(accountingData = {}, regime = get(accountingData.settings)) {
    if (!isExempt(regime)) return accountingData;
    (accountingData.sales || []).forEach(row => { row.rate = 0; });
    (accountingData.purchases || []).forEach(row => { row.deductible = false; });
    if (accountingData.settings) accountingData.settings.vatCarryover = 0;
    return accountingData;
  }

  global.BastVatRegime = Object.freeze({ DEFAULT_REGIME, LABELS, get, isExempt, isMixed, label, hasEntries, applyRules });
})(globalThis);
