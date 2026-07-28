import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDK3VeC-TOfXliPrY9IrHN0tFPf7KEm_j0',
  authDomain: 'bastcompta-3aa41.firebaseapp.com',
  projectId: 'bastcompta-3aa41',
  storageBucket: 'bastcompta-3aa41.firebasestorage.app',
  messagingSenderId: '724620573737',
  appId: '1:724620573737:web:b44e0d3f8b1cbf382b3038'
};

const STORAGE_KEY = 'devis-facture-style-vrai-document';
const DRAFTS_KEY = 'bastcompta-terrain-drafts-v1';
const FAVORITES_KEY = 'bastcompta-terrain-favorites-v1';
const app = initializeApp(firebaseConfig, 'bastcompta-terrain');
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);

const $ = selector => document.querySelector(selector);
const loadingScreen = $('#terrainLoading');
const authScreen = $('#terrainAuth');
const appScreen = $('#terrainApp');
const viewRoot = $('#viewRoot');
const pageTitle = $('#pageTitle');
const backBtn = $('#backBtn');
const toast = $('#toast');
const bottomNav = $('#bottomNav');

let state = {
  data: null,
  drafts: [],
  favorites: [],
  view: 'home',
  history: [],
  selectedClientId: '',
  activeDraft: null,
  query: '',
  currentUser: null
};

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function normalizeText(value = '') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function money(value) {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadAllData() {
  state.data = readJson(STORAGE_KEY, { company: {}, quote: {}, clients: [], tarifs: { categories: [], items: [] } });
  if (!Array.isArray(state.data.clients)) state.data.clients = [];
  if (!state.data.tarifs || typeof state.data.tarifs !== 'object') state.data.tarifs = { categories: [], items: [] };
  if (!Array.isArray(state.data.tarifs.items)) state.data.tarifs.items = [];
  state.drafts = readJson(DRAFTS_KEY, []);
  if (!Array.isArray(state.drafts)) state.drafts = [];
  state.favorites = readJson(FAVORITES_KEY, []);
  if (!Array.isArray(state.favorites)) state.favorites = [];
}

function saveMainData() {
  writeJson(STORAGE_KEY, state.data);
}

function saveDrafts() {
  writeJson(DRAFTS_KEY, state.drafts);
}

function showOnly(screen) {
  [loadingScreen, authScreen, appScreen].forEach(item => item.classList.add('hidden'));
  screen.classList.remove('hidden');
}

let toastTimer;
function showToast(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

function setView(view, options = {}) {
  if (options.push !== false && state.view !== view) state.history.push(state.view);
  state.view = view;
  state.query = '';
  render();
}

function goBack() {
  const previous = state.history.pop() || 'home';
  state.view = previous;
  render();
}

function updateNavigation() {
  const titles = {
    home: 'Accueil', clients: 'Clients', 'client-form': 'Fiche client', 'client-detail': 'Suivi client',
    prices: 'Tarifs', drafts: 'Brouillons', 'new-quote': 'Nouveau devis', 'quote-client': 'Choisir un client',
    'quote-lines': 'Composer le devis', 'quote-final': 'Finaliser le devis'
  };
  pageTitle.textContent = titles[state.view] || 'BastCompta Terrain';
  backBtn.classList.toggle('hidden', state.view === 'home');
  bottomNav.querySelectorAll('[data-nav]').forEach(button => {
    const nav = button.dataset.nav;
    const active = nav === state.view || (nav === 'new-quote' && state.view.startsWith('quote-'));
    button.classList.toggle('active', active);
  });
}

function clientDisplay(client) {
  return client.name || client.contact || 'Client sans nom';
}

function clientsSorted() {
  return [...state.data.clients].sort((a, b) => {
    if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
    return clientDisplay(a).localeCompare(clientDisplay(b), 'fr', { sensitivity: 'base' });
  });
}

function filteredClients() {
  const q = normalizeText(state.query);
  return clientsSorted().filter(client => !q || normalizeText([
    client.name, client.contact, client.email, client.phone, client.address, client.clientNumber, client.notes
  ].join(' ')).includes(q));
}

function tarifPrice(item) {
  return Number(String(item.prix || item.prixSimple || 0).replace(',', '.')) || 0;
}

function tarifUnit(item) {
  return item.mesure || item.unite || 'p';
}

function filteredTarifs() {
  const q = normalizeText(state.query);
  return [...state.data.tarifs.items]
    .filter(item => !q || normalizeText([item.poste, item.categorie, item.tags, item.remarque].join(' ')).includes(q))
    .sort((a, b) => String(a.categorie || '').localeCompare(String(b.categorie || ''), 'fr') || String(a.poste || '').localeCompare(String(b.poste || ''), 'fr'));
}

function draftTotals(draft) {
  const rows = Array.isArray(draft?.lines) ? draft.lines : [];
  let htva = 0;
  let vat = 0;
  rows.forEach(row => {
    const qty = Number(row.qty) || 0;
    const price = Number(row.unitPrice) || 0;
    const discount = Math.max(0, Math.min(100, Number(row.discount) || 0));
    const net = qty * price * (1 - discount / 100);
    htva += net;
    vat += net * ((Number(row.vatRate) || 0) / 100);
  });
  return { htva, vat, tvac: htva + vat };
}

function makeBlankDraft(client = null) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: uid('draft'),
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientId: client?.id || '',
    clientName: client?.name || '',
    clientEmail: client?.email || '',
    clientNumber: client?.clientNumber || '',
    clientVat: client?.vat || '',
    address: client?.address || '',
    siteName: '',
    date: today,
    validity: '',
    notes: '',
    lines: []
  };
}

function ensureActiveDraft() {
  if (!state.activeDraft) state.activeDraft = makeBlankDraft();
  if (!Array.isArray(state.activeDraft.lines)) state.activeDraft.lines = [];
}

function persistActiveDraft(message = '') {
  ensureActiveDraft();
  state.activeDraft.updatedAt = new Date().toISOString();
  const index = state.drafts.findIndex(item => item.id === state.activeDraft.id);
  if (index >= 0) state.drafts[index] = clone(state.activeDraft);
  else state.drafts.unshift(clone(state.activeDraft));
  saveDrafts();
  if (message) showToast(message);
}

function renderHome() {
  const recentDrafts = state.drafts.slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,2);
  const currentClient = state.data.clients.length;
  const prices = state.data.tarifs.items.length;
  viewRoot.innerHTML = `
    <section class="hero">
      <h2>Devis rapide sur le terrain</h2>
      <p>Choisis un client, ajoute tes prestations et transfère le devis dans BastCompta.</p>
      <button class="primary-button" type="button" data-action="start-quote">＋ Nouveau devis</button>
    </section>
    <section class="quick-grid">
      <button class="quick-card" type="button" data-action="nav-clients"><span>👥</span><div><strong>${currentClient} client${currentClient === 1 ? '' : 's'}</strong><small>Recherche et suivi</small></div></button>
      <button class="quick-card" type="button" data-action="nav-prices"><span>🏷️</span><div><strong>${prices} tarif${prices === 1 ? '' : 's'}</strong><small>Prestations disponibles</small></div></button>
      <button class="quick-card" type="button" data-action="nav-drafts"><span>📄</span><div><strong>${state.drafts.length} brouillon${state.drafts.length === 1 ? '' : 's'}</strong><small>Reprendre un devis</small></div></button>
      <a class="quick-card link-button" href="index.html"><span>🖥️</span><div><strong>Version complète</strong><small>Gestion BastCompta</small></div></a>
    </section>
    ${recentDrafts.length ? `<div class="section-head"><h2>Derniers brouillons</h2></div><div class="list">${recentDrafts.map(renderDraftCard).join('')}</div>` : ''}
  `;
}

function renderClients() {
  const clients = filteredClients();
  viewRoot.innerHTML = `
    <div class="section-head"><h2>${state.data.clients.length} client${state.data.clients.length === 1 ? '' : 's'}</h2><button type="button" data-action="new-client">＋ Ajouter</button></div>
    <div class="search-row"><input id="clientSearch" class="search-input" type="search" placeholder="Nom, téléphone, adresse…" value="${escapeHtml(state.query)}"></div>
    <div class="list">${clients.length ? clients.map(client => `
      <article class="list-card">
        <div class="list-main" data-action="client-detail" data-id="${escapeHtml(client.id)}">
          <strong>${client.favorite ? '★ ' : ''}${escapeHtml(clientDisplay(client))}</strong>
          <small>${escapeHtml(client.phone || client.email || client.address || 'Aucune coordonnée')}</small>
          ${client.notes ? `<div class="client-note">${escapeHtml(client.notes)}</div>` : ''}
        </div>
        <div class="list-actions"><button class="mini-btn" type="button" data-action="quote-for-client" data-id="${escapeHtml(client.id)}">Devis</button><button class="mini-btn" type="button" data-action="edit-client" data-id="${escapeHtml(client.id)}">✎</button></div>
      </article>`).join('') : '<div class="empty">Aucun client trouvé.</div>'}</div>`;
  bindSearch('#clientSearch');
}

function renderClientForm() {
  const existing = state.selectedClientId ? state.data.clients.find(item => item.id === state.selectedClientId) : null;
  const client = existing || { id: '', name: '', contact: '', email: '', phone: '', address: '', clientNumber: '', vat: '', notes: '', favorite: false };
  viewRoot.innerHTML = `
    <div class="form-card">
      <div class="field"><label for="cfName">Nom du client *</label><input id="cfName" value="${escapeHtml(client.name || '')}"></div>
      <div class="field-row"><div class="field"><label for="cfPhone">Téléphone</label><input id="cfPhone" type="tel" value="${escapeHtml(client.phone || '')}"></div><div class="field"><label for="cfEmail">E-mail</label><input id="cfEmail" type="email" value="${escapeHtml(client.email || '')}"></div></div>
      <div class="field"><label for="cfAddress">Adresse</label><textarea id="cfAddress" rows="2">${escapeHtml(client.address || '')}</textarea></div>
      <div class="field-row"><div class="field"><label for="cfNumber">N° client</label><input id="cfNumber" value="${escapeHtml(client.clientNumber || '')}"></div><div class="field"><label for="cfVat">TVA</label><input id="cfVat" value="${escapeHtml(client.vat || '')}"></div></div>
      <div class="field"><label for="cfContact">Personne de contact</label><input id="cfContact" value="${escapeHtml(client.contact || '')}"></div>
      <div class="field"><label for="cfNotes">Notes / suivi</label><textarea id="cfNotes" rows="4">${escapeHtml(client.notes || '')}</textarea></div>
      <label class="field"><span>Favori</span><select id="cfFavorite"><option value="0" ${!client.favorite ? 'selected' : ''}>Non</option><option value="1" ${client.favorite ? 'selected' : ''}>Oui</option></select></label>
      <div class="form-actions"><button class="secondary-button" type="button" data-action="cancel-client">Annuler</button><button class="primary-button" type="button" data-action="save-client">Enregistrer</button></div>
    </div>`;
}

function renderClientDetail() {
  const client = state.data.clients.find(item => item.id === state.selectedClientId);
  if (!client) return setView('clients', { push: false });
  const drafts = state.drafts.filter(d => d.clientId === client.id);
  viewRoot.innerHTML = `
    <article class="form-card">
      <div><span class="category-chip">${escapeHtml(client.clientNumber ? `Client ${client.clientNumber}` : 'Client')}</span><h2>${escapeHtml(clientDisplay(client))}</h2></div>
      ${client.phone ? `<a href="tel:${escapeHtml(client.phone)}">📞 ${escapeHtml(client.phone)}</a>` : ''}
      ${client.email ? `<a href="mailto:${escapeHtml(client.email)}">✉️ ${escapeHtml(client.email)}</a>` : ''}
      ${client.address ? `<div>📍 ${escapeHtml(client.address)}</div>` : ''}
      ${client.vat ? `<div>TVA : ${escapeHtml(client.vat)}</div>` : ''}
      ${client.notes ? `<div><strong>Notes</strong><div class="client-note">${escapeHtml(client.notes)}</div></div>` : ''}
      <div class="form-actions"><button class="secondary-button" type="button" data-action="edit-client" data-id="${escapeHtml(client.id)}">Modifier</button><button class="primary-button" type="button" data-action="quote-for-client" data-id="${escapeHtml(client.id)}">Nouveau devis</button></div>
    </article>
    <div class="section-head"><h2>Devis terrain (${drafts.length})</h2></div>
    <div class="list">${drafts.length ? drafts.map(renderDraftCard).join('') : '<div class="empty">Aucun devis terrain pour ce client.</div>'}</div>`;
}

function renderPrices() {
  const items = filteredTarifs();
  viewRoot.innerHTML = `
    <div class="section-head"><h2>${state.data.tarifs.items.length} prestation${state.data.tarifs.items.length === 1 ? '' : 's'}</h2><button type="button" data-action="open-full-prices">Gérer</button></div>
    <div class="search-row"><input id="priceSearch" class="search-input" type="search" placeholder="Taille, déplacement, évacuation…" value="${escapeHtml(state.query)}"></div>
    <div class="list">${items.length ? items.map(item => {
      const favorite = state.favorites.includes(item.id);
      return `<article class="list-card"><div class="list-main"><span class="category-chip">${escapeHtml(item.categorie || 'Sans catégorie')}</span><strong>${escapeHtml(item.poste || 'Prestation')}</strong><small>${escapeHtml(item.remarque || item.tags || '')}</small></div><div class="list-actions"><div class="price nowrap">${money(tarifPrice(item))}/${escapeHtml(tarifUnit(item))}</div><button class="mini-btn" type="button" data-action="toggle-favorite" data-id="${escapeHtml(item.id)}">${favorite ? '★' : '☆'}</button>${state.activeDraft ? `<button class="mini-btn" type="button" data-action="add-tarif" data-id="${escapeHtml(item.id)}">＋</button>` : ''}</div></article>`;
    }).join('') : '<div class="empty">Aucun tarif trouvé. Ajoute d’abord tes prestations dans la version complète.</div>'}</div>`;
  bindSearch('#priceSearch');
}

function renderDraftCard(draft) {
  const totals = draftTotals(draft);
  return `<article class="list-card"><div class="list-main" data-action="open-draft" data-id="${escapeHtml(draft.id)}"><strong>${escapeHtml(draft.clientName || 'Client à choisir')}</strong><small>${escapeHtml(draft.siteName || 'Sans chantier')} · ${new Date(draft.updatedAt || draft.createdAt).toLocaleDateString('fr-BE')}</small></div><div class="list-actions"><span class="draft-status">Brouillon</span><strong class="price">${money(totals.tvac)}</strong><button class="mini-btn danger" type="button" data-action="delete-draft" data-id="${escapeHtml(draft.id)}">×</button></div></article>`;
}

function renderDrafts() {
  const drafts = state.drafts.slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  viewRoot.innerHTML = `<div class="section-head"><h2>${drafts.length} brouillon${drafts.length === 1 ? '' : 's'}</h2><button type="button" data-action="start-quote">＋ Nouveau</button></div><div class="list">${drafts.length ? drafts.map(renderDraftCard).join('') : '<div class="empty">Aucun brouillon. Crée ton premier devis.</div>'}</div>`;
}

function renderQuoteClient() {
  ensureActiveDraft();
  const clients = filteredClients();
  viewRoot.innerHTML = `
    <div class="confirm-box"><strong>Étape 1 sur 3</strong><br><span class="muted">Choisis le client ou crée-le directement.</span></div>
    <div class="section-head"><h2>Client du devis</h2><button type="button" data-action="new-client-from-quote">＋ Nouveau</button></div>
    <div class="search-row"><input id="quoteClientSearch" class="search-input" type="search" placeholder="Rechercher un client…" value="${escapeHtml(state.query)}"></div>
    <div class="list">${clients.length ? clients.map(client => `<button class="list-card" type="button" data-action="select-quote-client" data-id="${escapeHtml(client.id)}"><div class="list-main"><strong>${client.favorite ? '★ ' : ''}${escapeHtml(clientDisplay(client))}</strong><small>${escapeHtml(client.address || client.phone || client.email || '')}</small></div><span>›</span></button>`).join('') : '<div class="empty">Aucun client trouvé.</div>'}</div>`;
  bindSearch('#quoteClientSearch');
}

function lineMarkup(row, index) {
  const net = (Number(row.qty)||0) * (Number(row.unitPrice)||0) * (1 - (Number(row.discount)||0)/100);
  return `<article class="line-item" data-line-index="${index}">
    <div class="line-title-row"><input data-line-field="description" value="${escapeHtml(row.description || '')}" placeholder="Description"><button type="button" data-action="remove-line" data-index="${index}">×</button></div>
    <div class="line-fields">
      <label>Qté<input type="number" inputmode="decimal" step="0.01" data-line-field="qty" value="${escapeHtml(row.qty ?? 1)}"></label>
      <label>Unité<input data-line-field="unit" value="${escapeHtml(row.unit || 'p')}"></label>
      <label>Prix HT<input type="number" inputmode="decimal" step="0.01" data-line-field="unitPrice" value="${escapeHtml(row.unitPrice ?? 0)}"></label>
      <label>TVA<select data-line-field="vatRate">${[0,6,12,21].map(rate => `<option value="${rate}" ${Number(row.vatRate)===rate?'selected':''}>${rate}%</option>`).join('')}</select></label>
    </div>
    <div class="line-total">${money(net)}</div>
  </article>`;
}

function renderQuoteLines() {
  ensureActiveDraft();
  const draft = state.activeDraft;
  const client = state.data.clients.find(item => item.id === draft.clientId);
  const favoriteItems = state.favorites.map(id => state.data.tarifs.items.find(item => item.id === id)).filter(Boolean).slice(0,10);
  const totals = draftTotals(draft);
  viewRoot.innerHTML = `
    <div class="confirm-box"><strong>Étape 2 sur 3</strong><br><span class="muted">Ajoute les prestations et adapte les quantités.</span></div>
    <div class="quote-client"><div><strong>${escapeHtml(clientDisplay(client || draft))}</strong><small class="muted">${escapeHtml(draft.address || 'Adresse non renseignée')}</small></div><button type="button" data-action="change-client">Changer</button></div>
    <div class="field"><label for="siteName">Nom du chantier / objet</label><input id="siteName" placeholder="Ex. Taille de haie et évacuation" value="${escapeHtml(draft.siteName || '')}"></div>
    ${favoriteItems.length ? `<div class="section-head"><h2>Favoris</h2><button type="button" data-action="browse-prices">Tous les tarifs</button></div><div class="favorite-strip">${favoriteItems.map(item => `<button type="button" data-action="add-tarif" data-id="${escapeHtml(item.id)}">＋ ${escapeHtml(item.poste)}</button>`).join('')}</div>` : `<button class="add-line-btn" type="button" data-action="browse-prices">🏷 Choisir dans les tarifs</button>`}
    <div id="quoteLines" class="quote-lines">${draft.lines.length ? draft.lines.map(lineMarkup).join('') : '<div class="empty">Aucune prestation ajoutée.</div>'}</div>
    <button class="add-line-btn" type="button" data-action="add-custom-line">＋ Ligne libre</button>
    <div class="totals"><div class="totals-row"><span>HTVA</span><strong>${money(totals.htva)}</strong></div><div class="totals-row"><span>TVA</span><strong>${money(totals.vat)}</strong></div><div class="totals-row grand"><span>Total TVAC</span><span>${money(totals.tvac)}</span></div><div class="quote-actions"><button class="outline" type="button" data-action="save-draft">Enregistrer</button><button class="light" type="button" data-action="quote-next">Continuer</button></div></div>`;
  bindQuoteFields();
}

function renderQuoteFinal() {
  ensureActiveDraft();
  const totals = draftTotals(state.activeDraft);
  const d = state.activeDraft;
  viewRoot.innerHTML = `
    <div class="confirm-box"><strong>Étape 3 sur 3</strong><br><span class="muted">Vérifie les dernières informations avant le transfert.</span></div>
    <div class="form-card">
      <div class="field-row"><div class="field"><label for="qDate">Date</label><input id="qDate" type="date" value="${escapeHtml(d.date || '')}"></div><div class="field"><label for="qValidity">Validité</label><input id="qValidity" placeholder="30 jours" value="${escapeHtml(d.validity || '')}"></div></div>
      <div class="field"><label for="qAddress">Adresse du chantier</label><textarea id="qAddress" rows="2">${escapeHtml(d.address || '')}</textarea></div>
      <div class="field"><label for="qNotes">Remarques du devis</label><textarea id="qNotes" rows="4" placeholder="Conditions, délai, détails…">${escapeHtml(d.notes || '')}</textarea></div>
      <div class="summary-card"><strong>${escapeHtml(d.clientName || 'Client')}</strong><div>${escapeHtml(d.siteName || 'Devis sans objet')}</div><div class="totals-row grand"><span>Total TVAC</span><span>${money(totals.tvac)}</span></div></div>
      <button class="secondary-button" type="button" data-action="save-final-draft">Enregistrer comme brouillon</button>
      <button class="primary-button" type="button" data-action="transfer-quote">Transférer vers BastCompta</button>
      <p class="footer-note">Le devis sera placé dans le module Devis complet. Tu pourras ensuite générer le PDF ou l’envoyer comme d’habitude.</p>
    </div>`;
  ['qDate','qValidity','qAddress','qNotes'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      const map = {qDate:'date',qValidity:'validity',qAddress:'address',qNotes:'notes'};
      state.activeDraft[map[id]] = el.value;
    });
  });
}

function render() {
  updateNavigation();
  const methods = {
    home: renderHome, clients: renderClients, 'client-form': renderClientForm, 'client-detail': renderClientDetail,
    prices: renderPrices, drafts: renderDrafts, 'quote-client': renderQuoteClient,
    'quote-lines': renderQuoteLines, 'quote-final': renderQuoteFinal
  };
  if (state.view === 'new-quote') {
    state.activeDraft = makeBlankDraft();
    state.history[state.history.length - 1] = 'home';
    state.view = 'quote-client';
    updateNavigation();
    renderQuoteClient();
  } else (methods[state.view] || renderHome)();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function bindSearch(selector) {
  const input = $(selector);
  if (!input) return;
  input.addEventListener('input', () => {
    state.query = input.value;
    const cursor = input.selectionStart;
    const view = state.view;
    render();
    const replacement = $(selector);
    replacement?.focus();
    replacement?.setSelectionRange(cursor, cursor);
    state.view = view;
  });
}

function bindQuoteFields() {
  const siteName = $('#siteName');
  siteName?.addEventListener('input', () => { state.activeDraft.siteName = siteName.value; });
  document.querySelectorAll('[data-line-index]').forEach(card => {
    const index = Number(card.dataset.lineIndex);
    card.querySelectorAll('[data-line-field]').forEach(input => {
      input.addEventListener('input', () => {
        const field = input.dataset.lineField;
        state.activeDraft.lines[index][field] = ['qty','unitPrice','vatRate','discount'].includes(field) ? Number(input.value) : input.value;
        renderQuoteLines();
      });
    });
  });
}

function addTarifToDraft(id) {
  ensureActiveDraft();
  const item = state.data.tarifs.items.find(t => t.id === id);
  if (!item) return;
  state.activeDraft.lines.push({
    description: item.poste || '', qty: 1, unit: tarifUnit(item), unitPrice: tarifPrice(item),
    costPrice: 0, discount: 0, vatRate: Number(item.tva) || 21, tarifId: item.id
  });
  showToast(`${item.poste || 'Prestation'} ajouté`);
}

function saveClientFromForm(returnToQuote = false) {
  const name = $('#cfName').value.trim();
  if (!name) return showToast('Indique le nom du client.');
  const existingIndex = state.data.clients.findIndex(item => item.id === state.selectedClientId);
  const existing = existingIndex >= 0 ? state.data.clients[existingIndex] : {};
  const client = {
    ...existing,
    id: existing.id || uid('client'),
    name,
    phone: $('#cfPhone').value.trim(), email: $('#cfEmail').value.trim(), address: $('#cfAddress').value.trim(),
    clientNumber: $('#cfNumber').value.trim(), vat: $('#cfVat').value.trim(), contact: $('#cfContact').value.trim(),
    notes: $('#cfNotes').value.trim(), favorite: $('#cfFavorite').value === '1', createdAt: existing.createdAt || new Date().toISOString()
  };
  if (existingIndex >= 0) state.data.clients[existingIndex] = client;
  else state.data.clients.push(client);
  saveMainData();
  state.selectedClientId = client.id;
  showToast('Client enregistré dans BastCompta.');
  if (returnToQuote || state.activeDraft) {
    state.activeDraft ||= makeBlankDraft();
    Object.assign(state.activeDraft, { clientId: client.id, clientName: client.name, clientEmail: client.email, clientNumber: client.clientNumber, clientVat: client.vat, address: client.address });
    setView('quote-lines', { push: false });
  } else setView('client-detail', { push: false });
}

function selectClientForQuote(clientId) {
  const client = state.data.clients.find(item => item.id === clientId);
  if (!client) return;
  ensureActiveDraft();
  Object.assign(state.activeDraft, { clientId: client.id, clientName: client.name || '', clientEmail: client.email || '', clientNumber: client.clientNumber || '', clientVat: client.vat || '', address: client.address || '' });
  setView('quote-lines');
}

function transferQuoteToMain() {
  ensureActiveDraft();
  const d = state.activeDraft;
  if (!d.clientName) return showToast('Choisis d’abord un client.');
  if (!d.lines.some(line => String(line.description || '').trim())) return showToast('Ajoute au moins une prestation.');
  const oldQuote = state.data.quote || {};
  state.data.quote = {
    ...oldQuote,
    documentNumber: '',
    clientNumber: d.clientNumber || '', clientVat: d.clientVat || '', clientId: d.clientId || '',
    clientName: d.clientName || '', clientEmail: d.clientEmail || '', address: d.address || '', date: d.date || '',
    validity: d.validity || '', siteName: d.siteName || '', chantierId: '',
    lines: clone(d.lines), suppliesEnabled: false, suppliesLines: [], notes: d.notes || ''
  };
  saveMainData();
  d.status = 'transferred';
  d.transferredAt = new Date().toISOString();
  persistActiveDraft();
  showToast('Devis transféré dans BastCompta.');
  setTimeout(() => { window.location.href = 'devis-facture.html?terrain=1'; }, 650);
}

viewRoot.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === 'start-quote') { state.activeDraft = makeBlankDraft(); setView('quote-client'); }
  else if (action === 'nav-clients') setView('clients');
  else if (action === 'nav-prices') setView('prices');
  else if (action === 'nav-drafts') setView('drafts');
  else if (action === 'new-client') { state.selectedClientId = ''; setView('client-form'); }
  else if (action === 'new-client-from-quote') { state.selectedClientId = ''; setView('client-form'); }
  else if (action === 'edit-client') { state.selectedClientId = id; setView('client-form'); }
  else if (action === 'client-detail') { state.selectedClientId = id; setView('client-detail'); }
  else if (action === 'cancel-client') goBack();
  else if (action === 'save-client') saveClientFromForm(!!state.activeDraft);
  else if (action === 'quote-for-client') { const client = state.data.clients.find(c => c.id === id); state.activeDraft = makeBlankDraft(client); setView('quote-lines'); }
  else if (action === 'select-quote-client') selectClientForQuote(id);
  else if (action === 'change-client') setView('quote-client');
  else if (action === 'toggle-favorite') {
    state.favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id];
    writeJson(FAVORITES_KEY, state.favorites); render();
  }
  else if (action === 'add-tarif') { addTarifToDraft(id); if (state.view === 'prices') setView('quote-lines', { push: false }); else renderQuoteLines(); }
  else if (action === 'browse-prices') setView('prices');
  else if (action === 'add-custom-line') { ensureActiveDraft(); state.activeDraft.lines.push({ description:'', qty:1, unit:'p', unitPrice:0, costPrice:0, discount:0, vatRate:21 }); renderQuoteLines(); }
  else if (action === 'remove-line') { state.activeDraft.lines.splice(Number(target.dataset.index),1); renderQuoteLines(); }
  else if (action === 'save-draft') { state.activeDraft.siteName = $('#siteName')?.value || state.activeDraft.siteName; persistActiveDraft('Brouillon enregistré.'); }
  else if (action === 'quote-next') { state.activeDraft.siteName = $('#siteName')?.value || state.activeDraft.siteName; if (!state.activeDraft.lines.length) return showToast('Ajoute au moins une ligne.'); persistActiveDraft(); setView('quote-final'); }
  else if (action === 'save-final-draft') { persistActiveDraft('Brouillon enregistré.'); setView('drafts'); }
  else if (action === 'transfer-quote') transferQuoteToMain();
  else if (action === 'open-draft') { const draft = state.drafts.find(d => d.id === id); if (draft) { state.activeDraft = clone(draft); setView('quote-lines'); } }
  else if (action === 'delete-draft') { if (confirm('Supprimer ce brouillon ?')) { state.drafts = state.drafts.filter(d => d.id !== id); saveDrafts(); render(); } }
  else if (action === 'open-full-prices') window.location.href = 'devis-facture.html';
});

bottomNav.addEventListener('click', event => {
  const button = event.target.closest('[data-nav]');
  if (!button) return;
  const nav = button.dataset.nav;
  if (nav === 'new-quote') { state.activeDraft = makeBlankDraft(); setView('quote-client'); }
  else setView(nav);
});

backBtn.addEventListener('click', goBack);

const loginForm = $('#terrainLoginForm');
const emailInput = $('#terrainEmail');
const passwordInput = $('#terrainPassword');
const authMessage = $('#terrainAuthMessage');
function setAuthMessage(text = '', type = '') { authMessage.textContent = text; authMessage.className = `message${type ? ` ${type}` : ''}`; }
function friendlyAuthError(error) {
  const code = String(error?.code || '');
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return 'Adresse mail ou mot de passe incorrect.';
  if (code.includes('too-many-requests')) return 'Trop de tentatives. Réessaie plus tard.';
  if (code.includes('network-request-failed')) return 'Connexion internet indisponible.';
  if (code.includes('invalid-email')) return 'Adresse mail invalide.';
  return 'Connexion impossible.';
}
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  setAuthMessage('Connexion…');
  $('#terrainLoginBtn').disabled = true;
  try { await signInWithEmailAndPassword(auth, emailInput.value.trim().toLowerCase(), passwordInput.value); }
  catch (error) { setAuthMessage(friendlyAuthError(error), 'error'); }
  finally { $('#terrainLoginBtn').disabled = false; }
});
$('#terrainForgotBtn').addEventListener('click', async () => {
  const email = emailInput.value.trim().toLowerCase();
  if (!email) return setAuthMessage('Indique d’abord ton adresse mail.', 'error');
  try { await sendPasswordResetEmail(auth, email); setAuthMessage('Lien de réinitialisation envoyé.', 'success'); }
  catch (error) { setAuthMessage(friendlyAuthError(error), 'error'); }
});

const accountMenu = $('#terrainAccountMenu');
$('#terrainAccountBtn').addEventListener('click', () => accountMenu.classList.remove('hidden'));
$('#closeAccountBtn').addEventListener('click', () => accountMenu.classList.add('hidden'));
$('#terrainLogoutBtn').addEventListener('click', async () => { accountMenu.classList.add('hidden'); await signOut(auth); });
$('#reloadDataBtn').addEventListener('click', () => { loadAllData(); accountMenu.classList.add('hidden'); render(); showToast('Données BastCompta rechargées.'); });

window.addEventListener('storage', event => {
  if ([STORAGE_KEY, DRAFTS_KEY, FAVORITES_KEY].includes(event.key)) { loadAllData(); render(); }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.currentUser) { loadAllData(); render(); }
});

onAuthStateChanged(auth, user => {
  state.currentUser = user;
  if (user) {
    loadAllData();
    $('#terrainUserEmail').textContent = user.email || 'Compte BastCompta connecté';
    setAuthMessage('');
    showOnly(appScreen);
    state.view = 'home'; state.history = []; state.activeDraft = null;
    render();
  } else {
    passwordInput.value = '';
    showOnly(authScreen);
  }
});
