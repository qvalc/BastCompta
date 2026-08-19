import assert from 'node:assert/strict';
import '../js/core/formatters.js';
import '../js/modules/documents/tariffs-ui.js';

const menu=BastTariffsUi.actionMenu([{label:'Modifier & ouvrir',action:'edit()'},{separator:true},{label:'Supprimer',action:'remove()',danger:true}]);
assert.match(menu,/Modifier &amp; ouvrir/);
assert.match(menu,/danger-item/);
assert.match(menu,/role="separator"/);
assert.equal(BastTariffsUi.selectOptions(['Mur','Sol'],'Sol'),'<option value="Mur" >Mur</option><option value="Sol" selected>Sol</option>');
console.log('Interface Tarifs commune valide.');
