/* BastCompta - calendrier natif avec saisie manuelle facultative JJ-MM-AAAA. */
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

  function companion(input) {
    return input?.parentElement?.querySelector?.('.bast-date-manual') || null;
  }

  function value(inputOrValue) {
    const raw = inputOrValue && typeof inputOrValue === 'object' ? inputOrValue.value : inputOrValue;
    return normalize(raw) || '';
  }

  function setValue(input, nextValue) {
    if (!input) return '';
    const iso = normalize(nextValue);
    input.value = iso || '';
    const manual = companion(input);
    if (manual) manual.value = display(iso || '');
    return iso || '';
  }

  function enhance(input) {
    if (!input || input.dataset.bastDateEnhanced === '1') return;
    input.dataset.bastDateEnhanced = '1';
    const wrapper = global.document.createElement('span');
    wrapper.className = 'bast-date-combo';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const manual = global.document.createElement('input');
    manual.type = 'text';
    manual.className = 'bast-date-manual';
    manual.inputMode = 'numeric';
    manual.autocomplete = 'off';
    manual.placeholder = 'JJ-MM-AAAA';
    manual.setAttribute('aria-label', 'Saisie manuelle de la date au format jour mois année');
    manual.value = display(input.value);
    wrapper.appendChild(manual);

    const syncManual = () => {
      manual.value = display(input.value);
      manual.setCustomValidity('');
    };
    input.addEventListener('input', syncManual);
    input.addEventListener('change', syncManual);

    manual.addEventListener('input', () => manual.setCustomValidity(''));
    manual.addEventListener('change', () => {
      const iso = normalize(manual.value);
      if (iso === null) {
        manual.setCustomValidity('Indique une date valide au format JJ-MM-AAAA, par exemple 11-03-1986.');
        manual.reportValidity();
        manual.focus();
        return;
      }
      manual.setCustomValidity('');
      input.value = iso;
      manual.value = display(iso);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function enhanceAll(root) {
    if (!global.document) return;
    if (root?.matches?.('input[type="date"]')) enhance(root);
    root?.querySelectorAll?.('input[type="date"]').forEach(enhance);
  }

  function installStyles() {
    if (!global.document || global.document.getElementById('bast-date-input-styles')) return;
    const style = global.document.createElement('style');
    style.id = 'bast-date-input-styles';
    style.textContent = `
      .bast-date-combo{display:grid;grid-template-columns:minmax(135px,1fr) minmax(118px,.75fr);gap:7px;align-items:center;width:100%}
      .bast-date-combo>input{min-width:0;width:100%;box-sizing:border-box}
      .bast-date-manual{font-variant-numeric:tabular-nums}
      @media(max-width:620px){.bast-date-combo{grid-template-columns:1fr}.bast-date-manual{min-height:42px}}
      @media print{.bast-date-manual{display:none!important}.bast-date-combo{display:block}}
    `;
    global.document.head.appendChild(style);
  }

  if (global.document) {
    const start = () => { installStyles(); enhanceAll(global.document); };
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', start);
    else start();
    new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(enhanceAll)))
      .observe(global.document.documentElement, { childList: true, subtree: true });
  }

  global.BastDateInputs = Object.freeze({ normalize, display, value, setValue, enhance, enhanceAll });
})(globalThis);
