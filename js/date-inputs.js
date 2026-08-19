/* BastCompta - calendrier natif avec saisie clavier JJ-MM-AAAA. */
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
    const raw = inputOrValue && typeof inputOrValue === 'object' ? inputOrValue.value : inputOrValue;
    return normalize(raw) || '';
  }

  function setValue(input, nextValue) {
    if (!input) return '';
    const iso = normalize(nextValue);
    input.value = iso || '';
    return iso || '';
  }

  let buffer = '';
  let activeInput = null;
  let bufferTimer = 0;
  let indicator = null;

  function formattedBuffer() {
    const padded = (buffer + '________').slice(0, 8);
    return `${padded.slice(0, 2)}-${padded.slice(2, 4)}-${padded.slice(4, 8)}`;
  }

  function ensureIndicator() {
    if (indicator?.isConnected) return indicator;
    indicator = global.document.createElement('div');
    indicator.className = 'bast-date-keyboard-indicator';
    indicator.setAttribute('role', 'status');
    global.document.body.appendChild(indicator);
    return indicator;
  }

  function positionIndicator(input) {
    const popup = ensureIndicator();
    const rect = input.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, global.innerWidth - 190))}px`;
    popup.style.top = `${Math.min(global.innerHeight - 46, rect.bottom + 6)}px`;
    popup.textContent = `Saisie : ${formattedBuffer()}`;
    popup.classList.add('visible');
  }

  function clearBuffer() {
    buffer = '';
    activeInput = null;
    global.clearTimeout(bufferTimer);
    indicator?.classList.remove('visible');
  }

  function commitBuffer(input) {
    const iso = normalize(buffer);
    if (iso === null) {
      input.setCustomValidity('Indique une date valide au format JJ-MM-AAAA, par exemple 11-03-1986.');
      input.reportValidity();
      clearBuffer();
      return false;
    }
    input.setCustomValidity('');
    input.value = iso;
    clearBuffer();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function handleDateKey(event) {
    const input = event.target;
    if (!input?.matches?.('input[type="date"]') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
      clearBuffer();
      return;
    }
    if (event.key === 'Backspace' && buffer) {
      event.preventDefault();
      buffer = buffer.slice(0, -1);
      positionIndicator(input);
      return;
    }
    if (/^[\d]$/.test(event.key)) {
      event.preventDefault();
      if (activeInput !== input) buffer = '';
      activeInput = input;
      buffer = (buffer + event.key).slice(0, 8);
      input.setCustomValidity('');
      positionIndicator(input);
      global.clearTimeout(bufferTimer);
      bufferTimer = global.setTimeout(clearBuffer, 10000);
      if (buffer.length === 8) commitBuffer(input);
      return;
    }
    if (/^[-/.]$/.test(event.key) && buffer) {
      event.preventDefault();
    }
  }

  function handlePaste(event) {
    const input = event.target;
    if (!input?.matches?.('input[type="date"]')) return;
    const pasted = event.clipboardData?.getData('text') || '';
    const iso = normalize(pasted);
    if (iso === null) return;
    event.preventDefault();
    input.value = iso;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function installStyles() {
    if (global.document.getElementById('bast-date-input-styles')) return;
    const style = global.document.createElement('style');
    style.id = 'bast-date-input-styles';
    style.textContent = `
      .bast-date-keyboard-indicator{position:fixed;z-index:12000;display:none;min-width:160px;padding:8px 11px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1e3a5f;box-shadow:0 8px 24px rgba(15,23,42,.16);font:700 13px/1.2 system-ui,sans-serif;pointer-events:none}
      .bast-date-keyboard-indicator.visible{display:block}
    `;
    global.document.head.appendChild(style);
  }

  if (global.document) {
    const start = installStyles;
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', start);
    else start();
    global.document.addEventListener('keydown', handleDateKey, true);
    global.document.addEventListener('paste', handlePaste, true);
    global.document.addEventListener('pointerdown', event => {
      if (event.target !== activeInput) clearBuffer();
    }, true);
    global.document.addEventListener('focusout', event => {
      if (event.target === activeInput && buffer.length < 8) clearBuffer();
    }, true);
  }

  global.BastDateInputs = Object.freeze({ normalize, display, value, setValue });
})(globalThis);
