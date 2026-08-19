/* BastCompta - registre central des cles de persistance. */
(function (global) {
  'use strict';

  const keys = Object.freeze({
    documents: 'devis-facture-style-vrai-document',
    documentsLastSave: 'devis-facture-style-vrai-document-last-save',
    accounting: 'comptabilite-local-v1',
    clients: 'bastcompta-chantiers-v1',
    clientsLastSave: 'bastcompta-chantiers-v1-last-save',
    deletedCrmClients: 'bastcompta-crm-deleted-clients-v1',
    personnel: 'bastcompta-personnel-v1',
    suppliers: 'bastcompta-fournisseurs-v1',
    taxes: 'bastcompta-impots-belgique-v1',
    terrainDrafts: 'bastcompta-terrain-drafts-v1',
    terrainFavorites: 'bastcompta-terrain-favorites-v1',
    trash: 'bastcompta-trash-v1',
    googleWasConnected: 'bastcompta_google_was_connected'
  });

  global.BastComptaStorageKeys = Object.freeze({
    ...keys,
    important: Object.freeze(Object.values(keys))
  });
})(window);
