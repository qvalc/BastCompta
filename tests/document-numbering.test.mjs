import assert from 'node:assert/strict';
import '../js/modules/documents/numbering.js';

const numbering = globalThis.BastDocumentNumbering;
assert.equal(numbering.format('quote', '2026', 1), 'D-2026-001');
assert.equal(numbering.format('credit_note', '2026', 12), 'NC-2026-012');
assert.deepEqual(numbering.parse('facture F-2026-042.json'), { kind: 'invoice', prefix: 'F', year: '2026', sequence: 42 });
assert.equal(numbering.parse('ancien-42'), null);
const values = ['F-2026-001', 'F-2026-009', 'F-2025-100', 'D-2026-050'];
assert.equal(numbering.highest('invoice', '2026', values), 9);
assert.equal(numbering.next('invoice', '2026', values), 'F-2026-010');
console.log('Numérotation des documents valide.');
