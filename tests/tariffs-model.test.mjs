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
library.items[0].composants=[{quantite:'2,5',prixUnitaire:'10'}];
assert.equal(model.componentTotal(library.items[0].composants[0]),25);
assert.equal(model.totalCost(library.items[0]),25);
assert.deepEqual(model.categories({...library,categories:['Mur']}),['Mur','Terrasse']);
assert.equal(model.subcategories(library,'Terrasse')[0].name,'Pierre');
assert.equal(model.subcategoryExists(library,'Terrasse','pierre'),true);
assert.equal(model.pathLabel(library.items[0]),'Terrasse › Pierre');
assert.equal(model.groupKey('Terrasse','Pierre'),'terrasse::pierre');

console.log('Modèle Tarifs valide.');
