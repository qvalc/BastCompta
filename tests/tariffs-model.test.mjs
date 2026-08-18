import assert from 'node:assert/strict';
import '../js/modules/documents/tariffs-model.js';

const model = globalThis.BastTariffsModel;
assert.deepEqual(model.uniqueNames([' Terrasse ', 'terrasse', '', 'Mur']), ['Terrasse', 'Mur']);
assert.deepEqual(model.normalizeSubcategories([
  { parent: 'Terrasse', name: 'Pierre' }, { parent: 'Terrasse', name: 'pierre' },
  { parent: '', name: 'Invalide' }
]), [{ parent: 'Terrasse', name: 'Pierre' }]);

const library = model.normalizeLibrary({
  categories: [' Terrasse ', 'terrasse'],
  subcategories: [{ parent: 'Terrasse', name: 'Pierre' }],
  items: [{ poste: 'Pose pierre bleue', categorie: 'Terrasse', souscategorie: 'Pierre', composants: null }]
}, () => 'tarif-1');
assert.equal(library.items[0].id, 'tarif-1');
assert.equal(library.items[0].sousCategorie, 'Pierre');
assert.deepEqual(library.items[0].composants, []);
assert.equal(model.filter(library.items, 'bleue', 'Toutes').length, 1);
assert.equal(model.filter(library.items, 'bleue', 'Mur').length, 0);

console.log('Modèle Tarifs valide.');
