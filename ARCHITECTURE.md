# Architecture BastCompta

## Principes

- `js/core/` contient les services et utilitaires communs, sans logique métier propre à une page.
- `js/modules/` contient la logique métier testable, organisée par domaine.
- Les anciens fichiers de page restent les orchestrateurs durant la migration progressive.
- Les clés de stockage et formats JSON existants restent compatibles.
- Toute nouvelle logique de calcul doit être pure et couverte par un test dans `tests/`.

## Styles

- `css/base.css` contient les fondations neutres partagées par toutes les interfaces.
- Chaque page conserve sa feuille de style métier pour son thème et ses composants propres.

## Socle commun

- `storage-keys.js` : registre unique des clés persistées.
- `storage.js` : miroir localStorage vers IndexedDB.
- `access-control.js` : accès aux modules intégrés au portail.
- `drive-client.js` : requêtes HTTP et pagination Google Drive.
- `utils.js` : nombres, monnaie, texte, JSON et clonage.

## Documents commerciaux

- `modules/documents/calculations.js` : lignes, TVA, totaux, marges, communication structurée et BCE.
- `modules/documents/numbering.js` : lecture et génération des numéros Devis/Facture/Rappel/Note de crédit.
- `modules/documents/peppol.js` : règles UBL, regroupement TVA et validation des points d’accès belges.
- `modules/documents/tariffs-model.js` : normalisation, catégories, sous-catégories et recherche des tarifs.
- `modules/clients/crm-model.js` : identité, normalisation, tri et correspondance des clients CRM.
- `modules/clients/project-links.js` : rapprochement client–suivi et déduplication des documents liés.
- `modules/clients/project-finance.js` : chiffres d’affaires, coûts, fournitures et marges par suivi.
- `modules/clients/project-model.js` : normalisation, fusion des doublons et déduplication des documents.
- `gestion-commerciale.js` : orchestration et interface du module Gestion commerciale, à réduire progressivement.

## Comptabilité

- `modules/accounting/calculations.js` : conversions TVA, notes de crédit, coûts professionnels et amortissements.
- `modules/accounting/vat-periods.js` : trimestres, échéances et structure des déclarations TVA.
- `modules/accounting/vat-declaration.js` : cases Intervat, solde, crédit reporté et registre TVA.
- `modules/accounting/financial-statements.js` : résultat, compte exploitant, cotisations et bilan simplifié.

## Vérification

La commande `npm run check` contrôle la syntaxe JavaScript, les ressources HTML, les fonctions dupliquées et les tests métier.

## Personnel

- `modules/personnel/calculations.js` : coûts salariaux, congés, absences et état courant.
- `modules/personnel/worker-model.js` : normalisation des travailleurs et de leurs dossiers.

## Fournisseurs

- `modules/suppliers/supplier-model.js` : fournisseurs, articles, remises, prix nets et marges.

## Impôts IPP

- `modules/taxes/calculations.js` : amortissements fiscaux, cotisations estimées et bénéfice imposable.
