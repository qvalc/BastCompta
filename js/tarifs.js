(function () {
  const STORAGE_KEY = 'bastcompta_tarifs_v7_vierge_sans_fiche';
  const CATEGORIES_KEY = 'bastcompta_tarifs_categories_v3_vierge_sans_fiche';
  const LEGACY_KEYS = [];
  const DEFAULT_TVA = '21';
  const DEVIS_FACTURE_KEY = 'devis-facture-style-vrai-document';
  const DEFAULT_CATEGORIES = [];
  const defaultTarifs = [];

  let tarifs = loadTarifs();
  let managedCategories = loadCategories();
  let selectedId = ''; // aucune fiche ouverte automatiquement à l’ouverture

  const editor = document.getElementById('tarifEditor');
  const template = document.getElementById('tarifTemplate');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const searchResults = document.getElementById('searchResults');
  const postList = document.getElementById('postList');
  const addBtn = document.getElementById('addBtn');
  const exportBtn = document.getElementById('exportBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const importInput = document.getElementById('importInput');
  const newCategoryInput = document.getElementById('newCategoryInput');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const managedCategoryList = document.getElementById('managedCategoryList');

  function makeId() { return 'tarif_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function emptyTarif() { return { id: makeId(), poste: '', categorie: '', mesure: '', prix: '', tva: DEFAULT_TVA, tags: '', remarque: '', prixSimple: '', prixMoyen: '', prixDifficile: '', historique: '', image: '', composants: [] }; }
  function emptyComposant() { return { nom: '', unite: '', quantite: '', prixUnitaire: '' }; }
  function normalize(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(',', '.'); }
  function num(value) { const n = parseFloat(String(value || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
  function money(value) { return num(value).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function pct(value) { return num(value).toLocaleString('fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'; }
  function escapeHtml(value) { return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
  function componentTotal(c) { return num(c.quantite) * num(c.prixUnitaire); }
  function totalCost(tarif) { return (tarif.composants || []).reduce((sum, c) => sum + componentTotal(c), 0); }
  function selectedIndex() { return tarifs.findIndex(t => t.id === selectedId); }
  function selectedTarif() { return tarifs[selectedIndex()] || null; }

  function migrate(item) {
    const base = Object.assign(emptyTarif(), item || {});
    base.id = item && item.id ? item.id : makeId();
    if (!Array.isArray(base.composants)) {
      base.composants = [];
      if (item && item.cout) base.composants.push({ nom: 'Coût de revient ancien', unite: 'forfait', quantite: '1', prixUnitaire: String(item.cout || '') });
    }
    base.composants = base.composants.map(c => Object.assign(emptyComposant(), c || {}));
    delete base.favorite; delete base.cout;
    return base;
  }
  function loadTarifs() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) for (const key of LEGACY_KEYS) { raw = localStorage.getItem(key); if (raw) break; }
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(migrate) : [];
    } catch { return []; }
  }
  function saveTarifs() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tarifs)); }
  function cleanCategoryList(list) {
    const seen = new Set();
    return list.map(c => String(c || '').trim()).filter(c => { const key = normalize(c); if (!c || seen.has(key)) return false; seen.add(key); return true; });
  }
  function loadCategories() {
    try { const raw = localStorage.getItem(CATEGORIES_KEY); return raw ? cleanCategoryList(JSON.parse(raw)) : []; } catch { return []; }
  }
  function saveCategories() { managedCategories = cleanCategoryList(managedCategories); localStorage.setItem(CATEGORIES_KEY, JSON.stringify(managedCategories)); }
  function categories() { return cleanCategoryList([...managedCategories, ...tarifs.map(t => t.categorie).filter(Boolean)]).sort((a, b) => a.localeCompare(b, 'fr')); }

  function searchableText(t) { const comp = (t.composants || []).map(c => [c.nom, c.unite, c.quantite, c.prixUnitaire].join(' ')).join(' '); return normalize([t.poste, t.categorie, t.mesure, t.prix, t.tva, t.tags, t.remarque, t.historique, comp].join(' ')); }
  function filteredTarifs() {
    const q = normalize(searchInput.value.trim()); const cat = categoryFilter.value || 'Toutes';
    return tarifs.filter(t => (cat === 'Toutes' || t.categorie === cat) && (!q || searchableText(t).includes(q)));
  }

  function renderFilters() {
    const current = categoryFilter.value || 'Toutes'; const cats = categories();
    categoryFilter.innerHTML = '<option value="Toutes">Toutes les catégories</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    categoryFilter.value = cats.includes(current) ? current : 'Toutes';
    document.getElementById('categoriesList').innerHTML = cats.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    managedCategoryList.innerHTML = '';
    managedCategories.forEach(cat => {
      const row = document.createElement('div'); row.className = 'managed-category-item';
      row.innerHTML = `<span>${escapeHtml(cat)}</span><button type="button" class="icon-delete" data-delete-category="${escapeHtml(cat)}" title="Supprimer" aria-label="Supprimer">×</button>`;
      managedCategoryList.appendChild(row);
    });
  }

  function renderPostList() {
    postList.innerHTML = '';
    if (!tarifs.length) { postList.innerHTML = '<p class="small-hint">Aucun poste.</p>'; return; }
    tarifs.forEach(t => {
      const row = document.createElement('div'); row.className = 'post-row' + (t.id === selectedId ? ' active' : '');
      row.innerHTML = `<button type="button" class="open-post" data-select="${escapeHtml(t.id)}">${escapeHtml(t.poste || 'Poste sans nom')}</button><button type="button" class="icon-delete" data-delete-post="${escapeHtml(t.id)}" title="Supprimer" aria-label="Supprimer">×</button>`;
      postList.appendChild(row);
    });
  }

  function renderSearchResults() {
    const rows = filteredTarifs();
    const hasQuery = searchInput.value.trim() || (categoryFilter.value && categoryFilter.value !== 'Toutes');
    searchResults.innerHTML = '';
    if (!hasQuery) return;
    if (!rows.length) { searchResults.innerHTML = '<div class="empty-state">Aucun poste trouvé.</div>'; return; }
    rows.slice(0, 25).forEach(t => {
      const item = document.createElement('div'); item.className = 'result-item';
      item.innerHTML = `<div><div class="result-title">${escapeHtml(t.poste || 'Poste sans nom')}</div><div class="result-meta">${escapeHtml(t.categorie || 'Sans catégorie')} · ${money(t.prix)} HTVA / ${escapeHtml(t.mesure || 'unité')}</div></div><button type="button" data-select="${escapeHtml(t.id)}">Ouvrir</button><button type="button" class="icon-delete" data-delete-post="${escapeHtml(t.id)}" title="Supprimer" aria-label="Supprimer">×</button>`;
      searchResults.appendChild(item);
    });
  }

  function renderEditor() {
    const tarif = selectedTarif(); editor.innerHTML = '';
    if (!tarif) { editor.innerHTML = '<div class="empty-state"><strong>Aucun poste sélectionné</strong><br>Recherche un poste, sélectionne-le, ou crée un nouveau poste dans le volet de gauche.</div>'; return; }
    const index = selectedIndex(); const card = template.content.firstElementChild.cloneNode(true); card.dataset.index = String(index);
    card.querySelectorAll('[data-field]').forEach(input => { input.value = tarif[input.dataset.field] || ''; });
    const cost = totalCost(tarif); const marge = num(tarif.prix) - cost; const margePct = num(tarif.prix) > 0 ? (marge / num(tarif.prix)) * 100 : 0;
    card.querySelector('.category-badge').textContent = tarif.categorie || 'Sans catégorie';
    card.querySelector('.price-quick').textContent = `${money(tarif.prix)} HTVA / ${tarif.mesure || 'unité'}`;
    card.querySelector('.cost-quick').textContent = `Coût ${money(cost)}`;
    const margeEl = card.querySelector('.margin-quick'); margeEl.textContent = `Marge ${money(marge)} (${pct(margePct)})`; margeEl.classList.add(margePct >= 35 ? 'good' : margePct >= 15 ? 'low' : 'bad');
    card.querySelector('[data-display="tvac"]').value = money(num(tarif.prix) * (1 + num(tarif.tva) / 100));
    card.querySelector('[data-display="cout"]').value = money(cost); card.querySelector('[data-display="marge"]').value = money(marge); card.querySelector('[data-display="margePct"]').value = pct(margePct);
    renderComponents(card, tarif);
    const photoBox = card.querySelector('.photo-box'); const img = card.querySelector('.photo-box img'); if (tarif.image) { img.src = tarif.image; photoBox.classList.add('has-image'); }
    editor.appendChild(card);
  }

  function renderComponents(card, tarif) {
    const tbody = card.querySelector('[data-components]'); tbody.innerHTML = '';
    if (!tarif.composants.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-components">Aucun composant. Clique sur “Ajouter un composant”.</td></tr>'; return; }
    tarif.composants.forEach((c, i) => {
      const tr = document.createElement('tr'); tr.dataset.componentIndex = String(i);
      tr.innerHTML = `<td><input data-component-field="nom" value="${escapeHtml(c.nom)}" placeholder="Bloc, sable, ciment..."></td><td><input data-component-field="unite" value="${escapeHtml(c.unite)}" placeholder="pièce, m³, sac..."></td><td><input class="number-input" data-component-field="quantite" value="${escapeHtml(c.quantite)}" inputmode="decimal"></td><td><input class="number-input" data-component-field="prixUnitaire" value="${escapeHtml(c.prixUnitaire)}" inputmode="decimal"></td><td class="component-total">${money(componentTotal(c))}</td><td class="no-print"><button type="button" class="icon-delete" data-action="deleteComponent" title="Supprimer" aria-label="Supprimer">×</button></td>`;
      tbody.appendChild(tr);
    });
  }

  function render() { renderFilters(); renderPostList(); renderSearchResults(); renderEditor(); }
  function update(index, field, value) {
    if (!tarifs[index]) return;
    tarifs[index][field] = value;
    saveTarifs();
    refreshPostLabel(tarifs[index]);
  }

  function refreshPostLabel(tarif) {
    if (!tarif) return;
    postList.querySelectorAll('[data-select]').forEach(btn => {
      if (btn.dataset.select === tarif.id) btn.textContent = tarif.poste || 'Poste sans nom';
    });
    searchResults.querySelectorAll('[data-select]').forEach(btn => {
      if (btn.dataset.select !== tarif.id) return;
      const item = btn.closest('.result-item');
      const title = item && item.querySelector('.result-title');
      const meta = item && item.querySelector('.result-meta');
      if (title) title.textContent = tarif.poste || 'Poste sans nom';
      if (meta) meta.textContent = `${tarif.categorie || 'Sans catégorie'} · ${money(tarif.prix)} HTVA / ${tarif.mesure || 'unité'}`;
    });
  }
  function updateComponent(tarifIndex, componentIndex, field, value) { const t = tarifs[tarifIndex]; if (!t || !t.composants[componentIndex]) return; t.composants[componentIndex][field] = value; saveTarifs(); }

  function refreshCurrentCard(card, tarifIndex) {
    const t = tarifs[tarifIndex];
    if (!card || !t) return;
    const cost = totalCost(t);
    const marge = num(t.prix) - cost;
    const margePct = num(t.prix) > 0 ? (marge / num(t.prix)) * 100 : 0;

    const badge = card.querySelector('.category-badge');
    if (badge) badge.textContent = t.categorie || 'Sans catégorie';

    const priceQuick = card.querySelector('.price-quick');
    if (priceQuick) priceQuick.textContent = `${money(t.prix)} HTVA / ${t.mesure || 'unité'}`;

    const costQuick = card.querySelector('.cost-quick');
    if (costQuick) costQuick.textContent = `Coût ${money(cost)}`;

    const marginQuick = card.querySelector('.margin-quick');
    if (marginQuick) {
      marginQuick.textContent = `Marge ${money(marge)} (${pct(margePct)})`;
      marginQuick.classList.remove('good', 'low', 'bad');
      marginQuick.classList.add(margePct >= 35 ? 'good' : margePct >= 15 ? 'low' : 'bad');
    }

    const tvac = card.querySelector('[data-display="tvac"]');
    const cout = card.querySelector('[data-display="cout"]');
    const margeInput = card.querySelector('[data-display="marge"]');
    const margePctInput = card.querySelector('[data-display="margePct"]');
    if (tvac) tvac.value = money(num(t.prix) * (1 + num(t.tva) / 100));
    if (cout) cout.value = money(cost);
    if (margeInput) margeInput.value = money(marge);
    if (margePctInput) margePctInput.value = pct(margePct);

    card.querySelectorAll('[data-component-index]').forEach(row => {
      const c = t.composants[Number(row.dataset.componentIndex)];
      const totalCell = row.querySelector('.component-total');
      if (c && totalCell) totalCell.textContent = money(componentTotal(c));
    });
  }
  function addTarifToDevisFacture(docKey, tarif) {
    const targetKey = docKey === 'invoice' ? 'invoice' : 'quote';
    if (!tarif) return;
    let payload = {};
    try { payload = JSON.parse(localStorage.getItem(DEVIS_FACTURE_KEY) || '{}') || {}; } catch { payload = {}; }
    if (!payload[targetKey] || typeof payload[targetKey] !== 'object') payload[targetKey] = {};
    if (!Array.isArray(payload[targetKey].lines)) payload[targetKey].lines = [];
    payload[targetKey].lines.push({
      description: tarif.poste || '',
      qty: 1,
      unit: tarif.mesure || '',
      unitPrice: num(tarif.prix),
      costPrice: totalCost(tarif),
      discount: 0,
      vatRate: num(tarif.tva || DEFAULT_TVA) || 21
    });
    localStorage.setItem(DEVIS_FACTURE_KEY, JSON.stringify(payload));
    try {
      window.parent?.postMessage({
        type: 'BASTCOMPTA_TARIF_ADDED_TO_DOCUMENT',
        docKey: targetKey,
        tarifId: tarif.id || ''
      }, window.location.origin);
    } catch {}
    toast(targetKey === 'invoice' ? 'Ajouté à la facture' : 'Ajouté au devis');
  }

  function copyText(text) { navigator.clipboard.writeText(text).then(() => toast('Copié')).catch(() => { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); toast('Copié'); }); }
  function toast(message) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; document.body.appendChild(el); setTimeout(() => el.remove(), 1600); }

  function addCategory(name) { const clean = String(name || '').trim(); if (!clean) return; if (managedCategories.some(c => normalize(c) === normalize(clean))) return toast('Cette catégorie existe déjà'); managedCategories.push(clean); saveCategories(); newCategoryInput.value = ''; render(); }
  function deleteCategory(name) { if (!confirm('Supprimer cette catégorie de la liste ? Les postes existants ne seront pas modifiés.')) return; managedCategories = managedCategories.filter(c => c !== name); saveCategories(); render(); }
  function deletePostById(id) { const idx = tarifs.findIndex(t => t.id === id); if (idx < 0 || !confirm('Supprimer ce poste ?')) return; tarifs.splice(idx, 1); selectedId = ''; saveTarifs(); render(); }
  function selectPost(id) { selectedId = id; render(); }
  function focusPosteInput() {
    const input = editor.querySelector('[data-field="poste"]');
    if (!input) return;
    input.focus();
    input.select();
  }

  function exportJson() { downloadBlob(new Blob([JSON.stringify({ version: 5, categories: managedCategories, tarifs }, null, 2)], { type: 'application/json' }), 'tarifs.json'); }
  function exportCsv() {
    const headers = ['Poste', 'Catégorie', 'Unité', 'Prix HTVA', 'TVA', 'Prix TVAC', 'Coût composants', 'Marge', 'Marge %', 'Composants', 'Tags', 'Remarque', 'Historique'];
    const lines = tarifs.map(t => { const cost = totalCost(t); const marge = num(t.prix) - cost; const margePct = num(t.prix) > 0 ? (marge / num(t.prix)) * 100 : 0; const comp = (t.composants || []).map(c => `${c.nom} (${c.quantite} ${c.unite} x ${c.prixUnitaire})`).join(' | '); return [t.poste, t.categorie, t.mesure, t.prix, t.tva, (num(t.prix) * (1 + num(t.tva) / 100)).toFixed(2), cost.toFixed(2), marge.toFixed(2), margePct.toFixed(1), comp, t.tags, t.remarque, t.historique].map(csvEscape).join(';'); });
    downloadBlob(new Blob([[headers.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }), 'tarifs.csv');
  }
  function csvEscape(v) { return '"' + String(v || '').replaceAll('"', '""') + '"'; }
  function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

  editor.addEventListener('input', e => {
    const card = e.target.closest('.tarif-card'); if (!card) return; const index = Number(card.dataset.index);
    const componentRow = e.target.closest('[data-component-index]');
    if (componentRow && e.target.dataset.componentField) {
      updateComponent(index, Number(componentRow.dataset.componentIndex), e.target.dataset.componentField, e.target.value);
      refreshCurrentCard(card, index);
      return;
    }
    if (e.target.dataset.field) {
      update(index, e.target.dataset.field, e.target.value);
      refreshCurrentCard(card, index);
    }
  });
  editor.addEventListener('focusout', () => { renderFilters(); renderPostList(); renderSearchResults(); });
  editor.addEventListener('change', e => {
    const card = e.target.closest('.tarif-card'); if (!card) return; const index = Number(card.dataset.index);
    if (e.target.dataset.action === 'image') { const file = e.target.files && e.target.files[0]; if (!file) return; if (file.size > 900000) { alert('Image trop lourde. Choisis plutôt une image de moins de 900 Ko.'); e.target.value = ''; return; } const reader = new FileReader(); reader.onload = () => { tarifs[index].image = String(reader.result || ''); saveTarifs(); render(); }; reader.readAsDataURL(file); }
  });
  editor.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return; const card = btn.closest('.tarif-card'); const index = Number(card && card.dataset.index); const t = tarifs[index]; if (!t) return; const row = btn.closest('[data-component-index]');
    if (btn.dataset.action === 'addComponent') { t.composants.push(emptyComposant()); saveTarifs(); render(); }
    if (btn.dataset.action === 'deleteComponent' && row) { t.composants.splice(Number(row.dataset.componentIndex), 1); saveTarifs(); render(); }
    if (btn.dataset.action === 'addQuote') addTarifToDevisFacture('quote', t);
    if (btn.dataset.action === 'addInvoice') addTarifToDevisFacture('invoice', t);
    if (btn.dataset.action === 'duplicate') { const copy = Object.assign({}, t, { id: makeId(), poste: (t.poste || '') + ' - copie', composants: (t.composants || []).map(c => Object.assign({}, c)) }); tarifs.splice(index + 1, 0, copy); selectedId = copy.id; saveTarifs(); render(); }
    if (btn.dataset.action === 'removeImage') { t.image = ''; saveTarifs(); render(); }
    if (btn.dataset.action === 'delete') deletePostById(t.id);
  });
  document.addEventListener('click', e => { const select = e.target.closest('[data-select]'); if (select) selectPost(select.dataset.select); const delPost = e.target.closest('[data-delete-post]'); if (delPost) deletePostById(delPost.dataset.deletePost); const delCat = e.target.closest('[data-delete-category]'); if (delCat) deleteCategory(delCat.dataset.deleteCategory); });
  addBtn.addEventListener('click', () => { const t = emptyTarif(); tarifs.unshift(t); selectedId = t.id; saveTarifs(); render(); document.getElementById('postsDrawer').open = true; focusPosteInput(); });
  searchInput.addEventListener('input', render); categoryFilter.addEventListener('change', render); exportBtn.addEventListener('click', exportJson); exportCsvBtn.addEventListener('click', exportCsv);
  addCategoryBtn.addEventListener('click', () => addCategory(newCategoryInput.value)); newCategoryInput.addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(newCategoryInput.value); });
  importInput.addEventListener('change', e => { const file = e.target.files && e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(reader.result); if (Array.isArray(imported)) tarifs = imported.map(migrate); else if (imported && Array.isArray(imported.tarifs)) { tarifs = imported.tarifs.map(migrate); if (Array.isArray(imported.categories)) { managedCategories = cleanCategoryList(imported.categories); saveCategories(); } } else throw new Error('Format incorrect'); selectedId = ''; saveTarifs(); render(); toast('Tarifs importés'); } catch { alert('Le fichier JSON n’est pas valide.'); } }; reader.readAsText(file); e.target.value = ''; });
  window.BastComptaModule = {
    name: 'Tarifs',
    save: async function () {
      saveTarifs();
      saveCategories();
      return { ok: true, module: 'tarifs', local: true, drive: false };
    },
    getStatus: () => ({ ready: true, module: 'tarifs' })
  };

  render();
})();
