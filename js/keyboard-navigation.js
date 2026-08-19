/* BastCompta - conservation du parcours clavier pendant les rendus dynamiques. */
(function (global) {
  'use strict';

  const selector = [
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  let pending = null;
  let clearTimer = 0;
  let restoreQueued = false;

  function focusableControls() {
    return Array.from(global.document.querySelectorAll(selector)).filter(element => {
      if (!element.isConnected || element.closest('[hidden],[aria-hidden="true"]')) return false;
      const style = global.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
  }

  function rememberNextControl(event) {
    if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const controls = focusableControls();
    const currentIndex = controls.indexOf(event.target);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + (event.shiftKey ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= controls.length) {
      pending = null;
      return;
    }
    pending = { index: nextIndex, startedAt: Date.now() };
    global.clearTimeout(clearTimer);
    clearTimer = global.setTimeout(() => { pending = null; }, 8000);
  }

  function restoreFocus() {
    restoreQueued = false;
    if (!pending || Date.now() - pending.startedAt > 8000) return;
    const controls = focusableControls();
    const target = controls[pending.index];
    if (!target || target === global.document.activeElement) return;
    const active = global.document.activeElement;
    const activeIndex = controls.indexOf(active);
    if (activeIndex === pending.index) return;
    target.focus({ preventScroll: true });
  }

  function queueRestore() {
    if (!pending || restoreQueued) return;
    restoreQueued = true;
    global.requestAnimationFrame(restoreFocus);
  }

  global.document.addEventListener('keydown', rememberNextControl, true);
  global.document.addEventListener('pointerdown', () => { pending = null; }, true);
  new MutationObserver(queueRestore).observe(global.document.documentElement, { childList: true, subtree: true });
})(window);
