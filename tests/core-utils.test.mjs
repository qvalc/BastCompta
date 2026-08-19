import assert from 'node:assert/strict';
import '../js/core/formatters.js';
import '../js/core/file-utils.js';

assert.equal(BastFormatters.number('1 234,50'),1234.5);
assert.equal(BastFormatters.number('invalide'),0);
assert.equal(BastFormatters.money('12,5'),'12,50 €');
assert.equal(BastFormatters.date('2026-08-19'),'19/08/2026');
assert.equal(BastFormatters.escapeHtml('<Test & "x">'),'&lt;Test &amp; &quot;x&quot;&gt;');
assert.equal(BastFormatters.normalizeText('Échéance'),'echeance');
assert.equal(BastFileUtils.safeNamePart('Facture été / 2026'),'Facture-ete-2026');
assert.match(BastFileUtils.createId('worker'),/^worker-[a-z0-9]+-[a-z0-9]+$/);
assert.deepEqual(BastFileUtils.parseJson('{"ok":true}'),{ok:true});
assert.equal(BastFileUtils.parseJson('{incorrect}',42),42);
assert.deepEqual(await BastFileUtils.parseJsonFile({text:async()=>'{"items":[1]}'}),{items:[1]});
assert.equal(await BastFileUtils.jsonBlob({ok:true}).text(),'{\n  "ok": true\n}');
console.log('Utilitaires communs valides.');
