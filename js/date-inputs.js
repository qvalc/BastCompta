/* BastCompta - saisie uniforme des dates au format JJ-MM-AAAA. */
(function (global) {
  'use strict';

  function normalize(value) {
    const source = String(value ?? '').trim();
    if (!source) return '';
    let day;
    let month;
    let year;
    let match = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
    } else {
      match = source.match(/^(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{4})$/);
      if (!match && /^\d{8}$/.test(source)) {
        match = [source, source.slice(0, 2), source.slice(2, 4), source.slice(4)];
      }
      if (!match) return null;
      day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
    }
    if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function display(value) {
    const iso = normalize(value);
    if (iso === null) return String(value ?? '');
    if (!iso) return '';
    const [year, month, day] = iso.split('-');
    return `${day}-${month}-${year}`;
  }

  function value(inputOrValue) {
    const raw = inputOrValue && typeof inputOrValue === 'object'
      ? (inputOrValue.dataset?.bastDateIso ?? inputOrValue.value)
      : inputOrValue;
    return normalize(raw) || '';
  }

  function setValue(input, nextValue) {
    if (!input) return '';
    const iso = normalize(nextValue);
    input.dataset.bastDateIso = iso || '';
    input.value = iso === null ? String(nextValue ?? '') : display(iso);
    return iso || '';
  }

  function enhance(input) {
    if (!input || input.dataset.bastDateEnhanced === '1') return;
    const initial = input.value;
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.placeholder = input.placeholder || 'JJ-MM-AAAA';
    input.dataset.bastDateEnhanced = '1';
    setValue(input, initial);
  }

  function enhanceAll(root) {
    if (!global.document) return;
    if (root?.matches?.('input[type="date"]')) enhance(root);
    root?.querySelectorAll?.('input[type="date"]').forEach(enhance);
  }

  function commitDate(event) {
    const input = event.target;
    if (!input?.matches?.('input[data-bast-date-enhanced="1"]')) return;
    const iso = normalize(input.value);
    if (iso === null) {
      input.setCustomValidity('Indique une date valide au format JJ-MM-AAAA, par exemple 11-03-1986.');
      event.preventDefault();
      event.stopImmediatePropagation();
      global.setTimeout(() => { input.reportValidity(); input.focus(); }, 0);
      return;
    }
    input.setCustomValidity('');
    input.dataset.bastDateIso = iso;
    input.value = iso;
    global.setTimeout(() => {
      if (input.isConnected) input.value = display(iso);
    }, 0);
  }

  if (global.document) {
    const start = () => enhanceAll(global.document);
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', start);
    else start();
    global.document.addEventListener('change', commitDate, true);
    global.document.addEventListener('input', event => event.target?.setCustomValidity?.(''), true);
    global.document.addEventListener('focusin', event => {
      const input = event.target;
      if (input?.matches?.('input[data-bast-date-enhanced="1"]')) setValue(input, input.value);
    }, true);
    new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(enhanceAll)))
      .observe(global.document.documentElement, { childList: true, subtree: true });
  }

  global.BastDateInputs = Object.freeze({ normalize, display, value, setValue, enhance, enhanceAll });
})(globalThis);
