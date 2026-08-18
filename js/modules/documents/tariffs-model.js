/* BastCompta - modele pur de la bibliotheque de tarifs. */
(function (global) {
  'use strict';

  const text = value => String(value ?? '').trim();
  const normalizeText = value => text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(',', '.');

  function uniqueNames(values = []) {
    const seen = new Set();
    return values.map(text).filter(value => {
      const key = normalizeText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeSubcategories(values = []) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map(entry => typeof entry === 'string'
      ? { parent: '', name: text(entry) }
      : { parent: text(entry?.parent), name: text(entry?.name) })
      .filter(entry => {
        const key = `${normalizeText(entry.parent)}::${normalizeText(entry.name)}`;
        if (!entry.parent || !entry.name || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const emptyComponent = () => ({ nom: '', unite: '', quantite: '', prixUnitaire: '' });
  function normalizeItem(item = {}, createId = () => '') {
    const normalized = {
      id: item.id || createId(), poste: '', categorie: '', sousCategorie: '', mesure: '', prix: '',
      tva: '21', tags: '', remarque: '', prixSimple: '', prixMoyen: '', prixDifficile: '',
      historique: '', composants: [], ...item
    };
    normalized.sousCategorie = text(item.sousCategorie || item.souscategorie);
    normalized.composants = (Array.isArray(item.composants) ? item.composants : [])
      .map(component => ({ ...emptyComponent(), ...(component || {}) }));
    delete normalized.favorite;
    delete normalized.cout;
    delete normalized.souscategorie;
    return normalized;
  }

  function normalizeLibrary(library, createId = () => '') {
    const source = library && typeof library === 'object' && !Array.isArray(library) ? library : {};
    return {
      ...source,
      categories: uniqueNames(source.categories || []),
      subcategories: normalizeSubcategories(source.subcategories),
      items: (Array.isArray(source.items) ? source.items : []).map(item => normalizeItem(item, createId))
    };
  }

  function searchableText(item = {}) {
    const components = (item.composants || []).map(component =>
      [component.nom, component.unite, component.quantite, component.prixUnitaire].join(' ')).join(' ');
    return normalizeText([
      item.poste, item.categorie, item.sousCategorie, item.mesure, item.prix, item.tva,
      item.tags, item.remarque, item.historique, components
    ].join(' '));
  }

  function filter(items = [], query = '', category = 'Toutes') {
    const needle = normalizeText(query);
    return items.filter(item => (!category || category === 'Toutes' || item.categorie === category)
      && (!needle || searchableText(item).includes(needle)));
  }

  global.BastTariffsModel = Object.freeze({
    normalizeText, uniqueNames, normalizeSubcategories, emptyComponent,
    normalizeItem, normalizeLibrary, searchableText, filter
  });
})(globalThis);
