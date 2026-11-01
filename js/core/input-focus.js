/* Préserver la saisie lorsque le rendu remplace les champs d’une page. */
(function (global) {
  'use strict';
  function capture(root) {
    const field = root?.ownerDocument?.activeElement;
    if (!field || !root.contains(field) || !['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName)) return () => {};
    if (['button', 'submit', 'file', 'hidden'].includes(field.type)) return () => {};
    const attributes = ['id', 'name', 'onchange', 'oninput'];
    const identity = attributes.map(name => field.getAttribute(name) || '');
    // Ne pas restaurer vers une autre ligne sur la seule base de sa position.
    if (!identity.some(Boolean)) return () => {};
    const matches = candidate => candidate.tagName === field.tagName && candidate.type === field.type
      && attributes.every((name, index) => (candidate.getAttribute(name) || '') === identity[index]);
    const candidates = [...root.querySelectorAll('input,textarea,select')].filter(matches);
    const ordinal = candidates.indexOf(field);
    const value = field.value, checked = field.checked;
    const start = field.selectionStart, end = field.selectionEnd, direction = field.selectionDirection;
    const top = field.scrollTop, left = field.scrollLeft;
    return () => {
      const next = [...root.querySelectorAll('input,textarea,select')].filter(matches)[ordinal];
      if (!next || next.disabled) return;
      const page = next.closest('.page');
      if (page && !page.classList.contains('active')) return;
      next.value = value;
      if (['checkbox', 'radio'].includes(field.type)) next.checked = checked;
      next.focus({ preventScroll: true });
      if (start !== null && typeof next.setSelectionRange === 'function') {
        try { next.setSelectionRange(start, end, direction); } catch { /* Champ numérique/date. */ }
      }
      next.scrollTop = top;
      next.scrollLeft = left;
    };
  }
  global.BastInputFocus = Object.freeze({ capture });
})(globalThis);
