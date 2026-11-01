import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../js/core/input-focus.js';

function field(overrides = {}) {
  return {
    tagName: 'TEXTAREA', type: 'textarea', value: 'Texte en cours', checked: false,
    selectionStart: 6, selectionEnd: 9, selectionDirection: 'backward', scrollTop: 20, scrollLeft: 0,
    getAttribute: name => name === 'onchange' ? "setDocumentLineField('quote', 'lines', 0, 'description', this.value)" : null,
    closest: () => ({ classList: { contains: () => true } }),
    focus(options) { this.focused = options; },
    setSelectionRange(start, end, direction) { this.selection = [start, end, direction]; },
    ...overrides
  };
}

function fixture(old = field()) {
  let fields = [old];
  const root = { ownerDocument: { activeElement: old }, contains: el => fields.includes(el), querySelectorAll: () => fields };
  return { root, old, replace: next => { fields = next; } };
}

test('un rafraîchissement conserve le texte non validé, le curseur et le défilement', () => {
  const app = fixture();
  const restore = BastInputFocus.capture(app.root);
  const next = field({ value: 'Ancienne valeur sauvegardée' });
  app.replace([next]);
  restore();
  assert.equal(next.value, 'Texte en cours');
  assert.deepEqual(next.selection, [6, 9, 'backward']);
  assert.equal(next.focused.preventScroll, true);
  assert.equal(next.scrollTop, 20);
});

test('un champ numérique garde la saisie intermédiaire sans sélection de texte', () => {
  const app = fixture(field({ tagName: 'INPUT', type: 'number', value: '1.75', selectionStart: null }));
  const restore = BastInputFocus.capture(app.root);
  const next = field({ tagName: 'INPUT', type: 'number', value: '1.00' });
  app.replace([next]);
  restore();
  assert.equal(next.value, '1.75');
  assert.equal(next.selection, undefined);
});

test('une navigation ou une suppression ne déplace pas la saisie dans un autre champ', () => {
  const app = fixture();
  const restore = BastInputFocus.capture(app.root);
  const hidden = field({ closest: () => ({ classList: { contains: () => false } }) });
  app.replace([hidden]);
  restore();
  assert.equal(hidden.focused, undefined);
  const different = field({ getAttribute: () => 'Autre ligne' });
  app.replace([different]);
  restore();
  assert.equal(different.focused, undefined);
});

test('le focus sur un bouton reste une action normale', () => {
  const app = fixture(field({ tagName: 'BUTTON', type: 'button' }));
  const restore = BastInputFocus.capture(app.root);
  const next = field();
  app.replace([next]);
  restore();
  assert.equal(next.focused, undefined);
});
