/* BastCompta - utilitaires purs partages par les modules. */
(function (global) {
  'use strict';

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function roundMoney(value) {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function money(value) {
    return toNumber(value).toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/\n/g, '&#10;');
  }

  function normalizeText(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function safeJsonParse(raw, fallback = null) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try { return JSON.parse(raw); } catch (error) { return fallback; }
  }

  function clone(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  global.BastComptaUtils = Object.freeze({
    toNumber, roundMoney, money, escapeHtml, escapeAttr, normalizeText, safeJsonParse, clone
  });
})(window);
