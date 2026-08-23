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
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDK3VeC-TOfXliPrY9IrHN0tFPf7KEm_j0',
  authDomain: 'bastcompta-3aa41.firebaseapp.com',
  projectId: 'bastcompta-3aa41',
  storageBucket: 'bastcompta-3aa41.firebasestorage.app',
  messagingSenderId: '724620573737',
  appId: '1:724620573737:web:b44e0d3f8b1cbf382b3038'
};

const STORAGE_KEY = window.BastComptaStorageKeys?.documents || 'devis-facture-style-vrai-document';
const DRAFTS_KEY = window.BastComptaStorageKeys?.terrainDrafts || 'bastcompta-terrain-drafts-v1';
const FAVORITES_KEY = window.BastComptaStorageKeys?.terrainFavorites || 'bastcompta-terrain-favorites-v1';
const CHANTIERS_KEY = window.BastComptaStorageKeys?.clients || 'bastcompta-chantiers-v1';
const CRM_DRIVE_FILE = 'bastcompta-crm-sync.json';
const CHANTIERS_DRIVE_FILE = 'bastcompta-chantiers-sync.json';
const DRAFTS_DRIVE_FILE = 'bastcompta-terrain-drafts.json';
const GOOGLE_CLIENT_ID = '724620573737-7o7bc9rn9r97r8fhqsfvlcl9dtaa7d7c.apps.googleusercontent.com';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const GOOGLE_WAS_CONNECTED_KEY = window.BastComptaStorageKeys?.googleWasConnected || 'bastcompta_google_was_connected';
const app = initializeApp(firebaseConfig, 'bastcompta-terrain');
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn('Persistance de connexion indisponible', error);
});

const $ = selector => document.querySelector(selector);
const loadingScreen = $('#terrainLoading');
const authScreen = $('#terrainAuth');
const appScreen = $('#terrainApp');
const subscriptionScreen = $('#terrainSubscription');
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
  currentUser: null,
  subscription: { status: 'free', allowed: false, data: null },
  chantiers: { projects: [] },
  drive: { token: '', expiresAt: 0, client: null, syncing: false },
  photoBusy: false,
  photoTarget: 'client',
  activeZoneId: '',
  pendingMeasureId: ''
};

const photoObjectUrls = new Map();

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

async function loadAllData() {
  const fallback = { company: {}, quote: {}, clients: [], tarifs: { categories: [], subcategories: [], items: [] } };
  state.data = window.BastStorage ? await BastStorage.getJson(STORAGE_KEY, fallback) : readJson(STORAGE_KEY, fallback);
  if (!state.data || typeof state.data !== 'object') state.data = clone(fallback);
  if (!Array.isArray(state.data.clients)) state.data.clients = [];
  if (!state.data.tarifs || typeof state.data.tarifs !== 'object') state.data.tarifs = { categories: [], subcategories: [], items: [] };
  if (!Array.isArray(state.data.tarifs.items)) state.data.tarifs.items = [];
  state.drafts = window.BastStorage ? await BastStorage.getJson(DRAFTS_KEY, []) : readJson(DRAFTS_KEY, []);
  if (!Array.isArray(state.drafts)) state.drafts = [];
  state.favorites = window.BastStorage ? await BastStorage.getJson(FAVORITES_KEY, []) : readJson(FAVORITES_KEY, []);
  if (!Array.isArray(state.favorites)) state.favorites = [];
  state.chantiers = window.BastStorage ? await BastStorage.getJson(CHANTIERS_KEY, { projects: [] }) : readJson(CHANTIERS_KEY, { projects: [] });
  if (!state.chantiers || typeof state.chantiers !== 'object') state.chantiers = { projects: [] };
  if (!Array.isArray(state.chantiers.projects)) state.chantiers.projects = [];
}

async function saveMainData(syncDrive = true) {
  if (window.BastStorage) await BastStorage.setJson(STORAGE_KEY, state.data);
  else writeJson(STORAGE_KEY, state.data);
  if (syncDrive && isDriveConnected()) await saveCrmToDrive(false);
}

async function saveDrafts(syncDrive = true) {
  if (window.BastStorage) await BastStorage.setJson(DRAFTS_KEY, state.drafts);
  else writeJson(DRAFTS_KEY, state.drafts);
  if (syncDrive && isDriveConnected()) await saveJsonToDrive(DRAFTS_DRIVE_FILE, state.drafts, false);
}

function parseSubscriptionDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isActiveSubscriptionEntry(entry, now = new Date()) {
  if (entry === true) return true;
  if (!entry || typeof entry !== 'object') return false;
  if (entry.active === false || ['inactive', 'expired', 'cancelled'].includes(entry.status)) return false;
  const endValue = entry.endsAt || entry.subscriptionEndsAt;
  if (!endValue) return entry.active === true || entry.status === 'active';
  const end = parseSubscriptionDate(endValue);
  return !!end && now <= end;
}

function getTerrainAccess(data = {}) {
  const now = new Date();

  if (data.subscriptionStatus === 'owner' || data.plan === 'owner') {
    return { client: true, premium: true };
  }

  const trialEnd = parseSubscriptionDate(data.trialEndsAt);
  if (data.trialUsed === true && trialEnd && now <= trialEnd) {
    return { client: true, premium: true };
  }

  const subscriptions = data.subscriptions || {};
  const premium = isActiveSubscriptionEntry(subscriptions.premium, now);
  const client = premium || isActiveSubscriptionEntry(subscriptions.client, now);
  return { client, premium };
}

function hasPremiumAccess() {
  return state.subscription?.access?.client === true;
}

function requirePremium(feature = 'Cette fonction') {
  if (hasPremiumAccess()) return true;
  showToast(`${feature} nécessite le Pack Gestion d’activité ou Premium.`);
  return false;
}

async function checkSubscription(user) {
  if (!user?.uid) {
    state.subscription = { status: 'free', allowed: false, access: { client: false, premium: false }, data: null };
    return;
  }
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? (snap.data() || {}) : {};
    const now = new Date();
    let status = data.subscriptionStatus || 'free';
    const trialEnd = parseSubscriptionDate(data.trialEndsAt);

    if (
      data.trialUsed === true &&
      trialEnd &&
      now > trialEnd &&
      (status === 'trial' || data.plan === 'trial')
    ) {
      const subscriptions = data.subscriptions || {};
      const hasPaidSubscription = ['accounting', 'client', 'premium']
        .some(key => isActiveSubscriptionEntry(subscriptions[key], now));

      if (!hasPaidSubscription) {
        status = 'free';
        const freeAccountData = {
          plan: 'free',
          monthlyPrice: 0,
          subscriptionActive: false,
          subscriptionStatus: 'free',
          updatedAt: now.toISOString()
        };

        Object.assign(data, freeAccountData);
        await updateDoc(userRef, freeAccountData).catch(error => {
          console.warn('Impossible de remettre automatiquement le compte en gratuit', error);
        });
      }
    }

    const access = getTerrainAccess(data);
    state.subscription = { status, allowed: access.client || access.premium, access, data };
  } catch (error) {
    console.warn('Statut abonnement indisponible', error);
    state.subscription = { status: 'free', allowed: false, access: { client: false, premium: false }, data: null };
  }
}

function isDriveConnected() {
  return !!state.drive.token && Date.now() < (state.drive.expiresAt - 60000);
}

function updateSyncLine(text, mode = '') {
  const el = document.getElementById('syncText');
  const line = document.getElementById('syncLine');
  if (el) el.textContent = text;
  if (line) line.dataset.status = mode;
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

async function getGoogleDriveEmail(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  if (!response.ok) throw new Error('Impossible de vérifier le compte Google Drive.');
  const profile = await response.json();
  return normalizeEmail(profile.email);
}

async function validateDriveAccountForCurrentUser(accessToken) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Utilisateur BastCompta non connecté.');
  const driveEmail = await getGoogleDriveEmail(accessToken);
  if (!driveEmail) throw new Error('Adresse email Google Drive introuvable.');

  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? (snap.data() || {}) : {};
  const savedDriveEmail = normalizeEmail(data.driveEmail);

  if (!savedDriveEmail) {
    await setDoc(userRef, {
      driveEmail,
      driveLinkedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return driveEmail;
  }
  if (savedDriveEmail !== driveEmail) {
    throw new Error('Ce compte BastCompta est déjà lié au Google Drive : ' + savedDriveEmail);
  }
  return driveEmail;
}

function initGoogleDrive() {
  if (!window.google?.accounts?.oauth2) return false;
  if (state.drive.client) return true;
  state.drive.client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    callback: () => {}
  });
  return true;
}

function requestDriveToken(interactive = true) {
  return new Promise((resolve, reject) => {
    if (!initGoogleDrive()) return reject(new Error('Google Drive pas encore prêt.'));
    const client = state.drive.client;
    client.callback = async response => {
      if (response?.error || !response?.access_token) return reject(new Error(response?.error || 'Autorisation refusée'));
      state.drive.token = response.access_token;
      state.drive.expiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
      try {
        await validateDriveAccountForCurrentUser(state.drive.token);
        localStorage.setItem(GOOGLE_WAS_CONNECTED_KEY, '1');
        resolve(state.drive.token);
      } catch (error) {
        state.drive.token = '';
        state.drive.expiresAt = 0;
        reject(error);
      }
    };
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

async function driveListByName(fileName) {
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${String(fileName).replace(/'/g, "\'")}' and trashed=false`, fields: 'files(id,name,modifiedTime)', pageSize: '10', orderBy: 'modifiedTime desc' });
  const res = await fetch('https://www.googleapis.com/drive/v3/files?' + q.toString(), { headers: { Authorization: 'Bearer ' + state.drive.token } });
  if (res.status === 401) { state.drive.token = ''; throw new Error('Session Google Drive expirée'); }
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).files || [];
}

async function loadJsonFromDrive(fileName) {
  const files = await driveListByName(fileName);
  if (!files.length) return null;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${files[0].id}?alt=media`, { headers: { Authorization: 'Bearer ' + state.drive.token } });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function saveJsonToDrive(fileName, payload, showErrors = true) {
  if (!isDriveConnected()) return false;
  try {
    const files = await driveListByName(fileName);
    const metadata = files.length ? { name: fileName } : { name: fileName, parents: ['appDataFolder'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const url = files.length
      ? `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=multipart&fields=id,name`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';
    const res = await fetch(url, { method: files.length ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + state.drive.token }, body: form });
    if (!res.ok) throw new Error(await res.text());
    return true;
  } catch (error) {
    console.error(error);
    if (showErrors) showToast('Sauvegarde Drive impossible.');
    return false;
  }
}

function safeFilePart(value = '') {
  return String(value || 'client').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'client';
}

async function compressPhoto(file, maxDimension = 1920, quality = 0.82) {
  if (!file?.type?.startsWith('image/')) throw new Error('Le fichier sélectionné n’est pas une image.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Compression impossible.')), 'image/jpeg', quality));
  return { blob, width, height };
}

async function uploadClientPhoto(client, file, note = '') {
  if (!isDriveConnected()) throw new Error('Connecte Google Drive avant d’ajouter une photo.');
  const compressed = await compressPhoto(file);
  const takenAt = new Date().toISOString();
  const fileName = `${safeFilePart(clientDisplay(client))}_${takenAt.replace(/[:.]/g, '-')}.jpg`;
  const metadata = {
    name: fileName,
    parents: ['appDataFolder'],
    appProperties: { bastType: 'client-photo', clientId: String(client.id || '') }
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', compressed.blob, fileName);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + state.drive.token },
    body: form
  });
  if (response.status === 401) { state.drive.token = ''; throw new Error('Session Google Drive expirée.'); }
  if (!response.ok) throw new Error('Envoi de la photo impossible.');
  const driveFile = await response.json();
  const photo = {
    id: uid('photo'), driveFileId: driveFile.id, fileName: driveFile.name || fileName,
    takenAt, note: String(note || '').trim(), width: compressed.width, height: compressed.height,
    size: Number(driveFile.size || compressed.blob.size), mimeType: 'image/jpeg'
  };
  if (!Array.isArray(client.photos)) client.photos = [];
  client.photos.unshift(photo);
  await saveMainData(true);
  return photo;
}

async function fetchPhotoObjectUrl(photo) {
  if (!photo?.driveFileId || !isDriveConnected()) return '';
  if (photoObjectUrls.has(photo.driveFileId)) return photoObjectUrls.get(photo.driveFileId);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photo.driveFileId)}?alt=media`, {
    headers: { Authorization: 'Bearer ' + state.drive.token }
  });
  if (!response.ok) return '';
  const url = URL.createObjectURL(await response.blob());
  photoObjectUrls.set(photo.driveFileId, url);
  return url;
}

async function hydrateClientPhotos() {
  const images = [...document.querySelectorAll('img[data-drive-photo]')];
  await Promise.all(images.map(async image => {
    const photo = { driveFileId: image.dataset.drivePhoto };
    const url = await fetchPhotoObjectUrl(photo);
    if (url && image.isConnected) {
      image.src = url;
      image.closest('.client-photo-card')?.classList.add('is-loaded');
    }
  }));
}

async function deleteClientPhoto(client, photoId) {
  const photo = (client.photos || []).find(item => item.id === photoId);
  if (!photo) return;
  if (photo.driveFileId && isDriveConnected()) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photo.driveFileId)}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + state.drive.token }
    });
    if (!response.ok && response.status !== 404) throw new Error('Suppression Drive impossible.');
    const url = photoObjectUrls.get(photo.driveFileId);
    if (url) URL.revokeObjectURL(url);
    photoObjectUrls.delete(photo.driveFileId);
  }
  client.photos = (client.photos || []).filter(item => item.id !== photoId);
  await saveMainData(true);
}

function formatPhotoDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function renderClientPhotos(client) {
  const photos = Array.isArray(client.photos) ? client.photos : [];
  const driveReady = isDriveConnected();
  return `<section class="client-photos-section">
    <div class="section-head photo-section-head"><h2>Photos (${photos.length})</h2></div>
    ${driveReady ? `<div class="photo-actions">
      <button class="primary-button" type="button" data-action="take-client-photo">📷 Prendre une photo</button>
      <button class="secondary-button" type="button" data-action="choose-client-photo">🖼️ Galerie</button>
      <input id="clientCameraInput" class="hidden" type="file" accept="image/*" capture="environment">
      <input id="clientGalleryInput" class="hidden" type="file" accept="image/*" multiple>
    </div>` : `<div class="premium-lock"><strong>Google Drive requis</strong><span>Connecte Google Drive dans le menu du compte pour prendre et conserver les photos de ce client.</span><button class="mini-btn" type="button" data-action="connect-drive-for-photos">Connecter Drive</button></div>`}
    <div id="clientPhotoProgress" class="photo-progress hidden" aria-live="polite">Préparation et envoi de la photo…</div>
    <div class="client-photo-grid">${photos.length ? photos.map(photo => `<article class="client-photo-card">
      <button class="client-photo-open" type="button" data-action="open-client-photo" data-id="${escapeHtml(photo.id)}" aria-label="Ouvrir la photo">
        <span class="photo-placeholder">📷</span><img data-drive-photo="${escapeHtml(photo.driveFileId || '')}" alt="Photo de ${escapeHtml(clientDisplay(client))}" loading="lazy">
      </button>
      <div class="client-photo-info"><small>${escapeHtml(formatPhotoDate(photo.takenAt))}</small>${photo.note ? `<span>${escapeHtml(photo.note)}</span>` : ''}</div>
      <button class="client-photo-delete" type="button" data-action="delete-client-photo" data-id="${escapeHtml(photo.id)}" aria-label="Supprimer la photo" title="Supprimer"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
    </article>`).join('') : '<div class="empty photo-empty">Aucune photo pour ce client.</div>'}</div>
  </section>`;
}


function renderQuotePhotos(draft) {
  const photos = Array.isArray(draft.photos) ? draft.photos : [];
  const driveReady = isDriveConnected();
  return `<section class="client-photos-section quote-photos-section">
    <div class="section-head photo-section-head"><h2>Photos du devis (${photos.length})</h2></div>
    <p class="muted photo-help">Ces photos resteront liées à ce devis et au client sélectionné.</p>
    ${driveReady ? `<div class="photo-actions">
      <button class="primary-button" type="button" data-action="take-quote-photo">📷 Prendre une photo</button>
      <button class="secondary-button" type="button" data-action="choose-quote-photo">🖼️ Galerie</button>
    </div>` : `<div class="premium-lock"><strong>Google Drive requis</strong><span>Connecte Google Drive pour ajouter des photos à ce devis.</span><button class="mini-btn" type="button" data-action="connect-drive-for-quote-photos">Connecter Drive</button></div>`}
    <div id="quotePhotoProgress" class="photo-progress hidden" aria-live="polite">Préparation et envoi de la photo…</div>
    <div class="client-photo-grid">${photos.length ? photos.map(photo => `<article class="client-photo-card">
      <button class="client-photo-open" type="button" data-action="open-quote-photo" data-id="${escapeHtml(photo.id)}" aria-label="Ouvrir la photo">
        <span class="photo-placeholder">📷</span><img data-drive-photo="${escapeHtml(photo.driveFileId || '')}" alt="Photo du devis" loading="lazy">
      </button>
      <div class="client-photo-info"><small>${escapeHtml(formatPhotoDate(photo.takenAt))}</small>${photo.note ? `<span>${escapeHtml(photo.note)}</span>` : ''}</div>
      <button class="client-photo-delete" type="button" data-action="delete-quote-photo" data-id="${escapeHtml(photo.id)}" aria-label="Supprimer la photo" title="Supprimer"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
    </article>`).join('') : '<div class="empty photo-empty">Aucune photo liée à ce devis.</div>'}</div>
  </section>`;
}

async function uploadQuotePhoto(draft, file, note = '') {
  if (!isDriveConnected()) throw new Error('Connecte Google Drive avant d’ajouter une photo.');
  const compressed = await compressPhoto(file);
  const fileName = `devis-${String(draft.id || 'terrain').replace(/[^a-z0-9_-]/gi,'-')}-${Date.now()}.jpg`;
  const metadata = {
    name: fileName,
    parents: ['appDataFolder'],
    appProperties: {
      bastType: 'quote-photo',
      draftId: String(draft.id || ''),
      clientId: String(draft.clientId || '')
    }
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', compressed.blob, fileName);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime', {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.drive.token}` },
    body: form
  });
  if (!response.ok) throw new Error('Envoi de la photo impossible.');
  const driveFile = await response.json();
  const photo = {
    id: uid('photo'), driveFileId: driveFile.id, fileName: driveFile.name || fileName,
    takenAt: new Date().toISOString(), note: String(note || '').trim(), scope: 'quote',
    draftId: draft.id || '', clientId: draft.clientId || '', zoneId: state.activeZoneId || '',
    width: compressed.width, height: compressed.height,
    size: Number(driveFile.size || compressed.blob.size), mimeType: 'image/jpeg'
  };
  if (!Array.isArray(draft.photos)) draft.photos = [];
  draft.photos.unshift(photo);
  await persistActiveDraft();
  return photo;
}

async function handleQuotePhotoFiles(files) {
  ensureActiveDraft();
  const draft = state.activeDraft;
  if (state.photoBusy || !files?.length) return;
  if (!isDriveConnected()) return showToast('Connecte Google Drive avant d’ajouter une photo.');
  const note = files.length === 1 ? (prompt('Ajouter une note à cette photo (facultatif) :', '') || '') : '';
  state.photoBusy = true;
  const progress = document.getElementById('quotePhotoProgress');
  progress?.classList.remove('hidden');
  try {
    for (const file of files) await uploadQuotePhoto(draft, file, note);
    showToast(files.length > 1 ? `${files.length} photos ajoutées au devis.` : 'Photo ajoutée au devis.');
    renderQuoteLines();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Envoi de la photo impossible.');
  } finally {
    state.photoBusy = false;
  }
}

async function deleteQuotePhoto(draft, photoId) {
  const photo = (draft.photos || []).find(item => item.id === photoId);
  if (!photo) return;
  if (photo.driveFileId && isDriveConnected()) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photo.driveFileId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${state.drive.token}` }
    });
    if (!response.ok && response.status !== 404) throw new Error('Suppression Drive impossible.');
    const url = photoObjectUrls.get(photo.driveFileId);
    if (url) URL.revokeObjectURL(url);
    photoObjectUrls.delete(photo.driveFileId);
  }
  draft.photos = (draft.photos || []).filter(item => item.id !== photoId);
  await persistActiveDraft();
}

async function openQuotePhoto(draft, photoId) {
  const photo = (draft.photos || []).find(item => item.id === photoId);
  if (!photo) return;
  const url = await fetchPhotoObjectUrl(photo);
  if (!url) return showToast('Impossible de charger cette photo.');
  const overlay = document.createElement('div');
  overlay.className = 'photo-viewer';
  overlay.innerHTML = `<button class="photo-viewer-close" type="button" aria-label="Fermer">✕</button><img src="${escapeHtml(url)}" alt="Photo du devis">${photo.note ? `<p>${escapeHtml(photo.note)}</p>` : ''}`;
  overlay.querySelector('.photo-viewer-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function handleClientPhotoFiles(files) {
  const client = state.data.clients.find(item => item.id === state.selectedClientId);
  if (!client || state.photoBusy || !files?.length) return;
  if (!isDriveConnected()) return showToast('Connecte Google Drive avant d’ajouter une photo.');
  const note = files.length === 1 ? (prompt('Ajouter une note à cette photo (facultatif) :', '') || '') : '';
  state.photoBusy = true;
  const progress = document.getElementById('clientPhotoProgress');
  progress?.classList.remove('hidden');
  try {
    for (const file of files) await uploadClientPhoto(client, file, note);
    showToast(files.length > 1 ? `${files.length} photos ajoutées au client.` : 'Photo ajoutée au client.');
    renderClientDetail();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Envoi de la photo impossible.');
  } finally {
    state.photoBusy = false;
  }
}

async function openClientPhoto(client, photoId) {
  const photo = (client.photos || []).find(item => item.id === photoId);
  if (!photo) return;
  const url = await fetchPhotoObjectUrl(photo);
  if (!url) return showToast('Impossible de charger cette photo.');
  const overlay = document.createElement('div');
  overlay.className = 'photo-viewer';
  overlay.innerHTML = `<button class="photo-viewer-close" type="button" aria-label="Fermer">✕</button><img src="${escapeHtml(url)}" alt="Photo de ${escapeHtml(clientDisplay(client))}">${photo.note ? `<p>${escapeHtml(photo.note)}</p>` : ''}`;
  overlay.querySelector('.photo-viewer-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function saveCrmToDrive(showErrors = true) {
  const payload = {
    company: state.data.company || {},
    clients: Array.isArray(state.data.clients) ? state.data.clients : [],
    mail: state.data.mail || {},
    tarifs: state.data.tarifs || { categories: [], subcategories: [], items: [] }
  };
  updateSyncLine('Synchronisation Google Drive…', 'working');
  const ok = await saveJsonToDrive(CRM_DRIVE_FILE, payload, showErrors);
  updateSyncLine(ok ? 'Synchronisé avec Google Drive' : 'Données locales — Drive non synchronisé', ok ? 'ok' : 'warning');
  return ok;
}

async function syncFromDrive() {
  if (!isDriveConnected()) return false;
  updateSyncLine('Chargement depuis Google Drive…', 'working');
  try {
    const crm = await loadJsonFromDrive(CRM_DRIVE_FILE);
    if (crm && typeof crm === 'object') {
      if (crm.company) state.data.company = crm.company;
      if (Array.isArray(crm.clients)) state.data.clients = crm.clients;
      if (crm.mail) state.data.mail = crm.mail;
      if (crm.tarifs) state.data.tarifs = crm.tarifs;
      await saveMainData(false);
    }
    const drafts = await loadJsonFromDrive(DRAFTS_DRIVE_FILE);
    if (Array.isArray(drafts)) { state.drafts = drafts; await saveDrafts(false); }
    if (hasPremiumAccess()) {
      const chantiers = await loadJsonFromDrive(CHANTIERS_DRIVE_FILE);
      if (chantiers && typeof chantiers === 'object') {
        state.chantiers = chantiers;
        if (window.BastStorage) await BastStorage.setJson(CHANTIERS_KEY, chantiers); else writeJson(CHANTIERS_KEY, chantiers);
      }
    }
    updateSyncLine('Synchronisé avec Google Drive', 'ok');
    render();
    return true;
  } catch (error) {
    console.warn(error);
    updateSyncLine('Données locales — connexion Drive nécessaire', 'warning');
    return false;
  }
}

async function connectAndSyncDrive(interactive = true) {
  try {
    await requestDriveToken(interactive);
    await syncFromDrive();
    showToast('Google Drive connecté.');
    return true;
  } catch (error) {
    console.warn(error);
    updateSyncLine('Google Drive non connecté', 'warning');
    if (interactive) showToast('Connexion Google Drive annulée ou impossible.');
    return false;
  }
}

function showOnly(screen) {
  [loadingScreen, authScreen, subscriptionScreen, appScreen].forEach(item => item.classList.add('hidden'));
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
    prices: 'Tarifs', drafts: 'Visites', 'new-quote': 'Nouvelle visite', 'quote-client': 'Choisir un client',
    'quote-lines': 'Relevé de visite', 'quote-final': 'Résumé du devis'
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
    .filter(item => !q || normalizeText([
      item.poste,
      item.categorie,
      item.sousCategorie,
      item.souscategorie,
      item.tags,
      item.remarque
    ].join(' ')).includes(q))
    .sort((a, b) =>
      String(a.categorie || '').localeCompare(String(b.categorie || ''), 'fr', { sensitivity: 'base' }) ||
      String(a.sousCategorie || a.souscategorie || '').localeCompare(String(b.sousCategorie || b.souscategorie || ''), 'fr', { sensitivity: 'base' }) ||
      String(a.poste || '').localeCompare(String(b.poste || ''), 'fr', { sensitivity: 'base' })
    );
}

function tarifCategoryOrder(name) {
  const categories = Array.isArray(state.data.tarifs.categories) ? state.data.tarifs.categories : [];
  const index = categories.findIndex(category => normalizeText(category) === normalizeText(name));
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function tarifSubcategoryOrder(category, name) {
  const subcategories = Array.isArray(state.data.tarifs.subcategories) ? state.data.tarifs.subcategories : [];
  const rows = subcategories.filter(row => normalizeText(row.parent || row.categorie || '') === normalizeText(category));
  const index = rows.findIndex(row => normalizeText(row.name || row.nom || '') === normalizeText(name));
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function groupTarifs(items) {
  const categoryMap = new Map();

  items.forEach(item => {
    const category = String(item.categorie || '').trim() || 'Sans catégorie';
    const subcategory = String(item.sousCategorie || item.souscategorie || '').trim() || '';
    if (!categoryMap.has(category)) categoryMap.set(category, new Map());
    const subMap = categoryMap.get(category);
    if (!subMap.has(subcategory)) subMap.set(subcategory, []);
    subMap.get(subcategory).push(item);
  });

  return [...categoryMap.entries()]
    .sort(([a], [b]) => {
      if (a === 'Sans catégorie') return 1;
      if (b === 'Sans catégorie') return -1;
      const order = tarifCategoryOrder(a) - tarifCategoryOrder(b);
      return order || a.localeCompare(b, 'fr', { sensitivity: 'base' });
    })
    .map(([category, subMap]) => ({
      category,
      groups: [...subMap.entries()]
        .sort(([a], [b]) => {
          if (!a) return 1;
          if (!b) return -1;
          const order = tarifSubcategoryOrder(category, a) - tarifSubcategoryOrder(category, b);
          return order || a.localeCompare(b, 'fr', { sensitivity: 'base' });
        })
        .map(([subcategory, rows]) => ({
          subcategory,
          items: rows.sort((a, b) => String(a.poste || '').localeCompare(String(b.poste || ''), 'fr', { sensitivity: 'base' }))
        }))
    }));
}

function renderTarifItem(item) {
  const favorite = state.favorites.includes(item.id);
  return `<article class="tarif-card">
    <div class="tarif-card-main">
      <strong>${escapeHtml(item.poste || 'Prestation')}</strong>
      ${item.remarque || item.tags ? `<small>${escapeHtml(item.remarque || item.tags || '')}</small>` : ''}
    </div>
    <div class="tarif-card-actions">
      <div class="price nowrap">${money(tarifPrice(item))}<span>/${escapeHtml(tarifUnit(item))}</span></div>
      <button class="mini-btn tarif-favorite-btn" type="button" data-action="toggle-favorite" data-id="${escapeHtml(item.id)}" title="${favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-label="${favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${favorite ? '★' : '☆'}</button>
      ${state.activeDraft ? `<button class="mini-btn tarif-add-btn" type="button" data-action="add-tarif" data-id="${escapeHtml(item.id)}" title="Ajouter au devis" aria-label="Ajouter au devis">＋</button>` : ''}
    </div>
  </article>`;
}

function renderTarifGroups(items) {
  const groups = groupTarifs(items);
  const searching = !!String(state.query || '').trim();

  return groups.map(group => {
    const total = group.groups.reduce((sum, sub) => sum + sub.items.length, 0);
    return `<details class="terrain-tarif-category" ${searching ? 'open' : ''}>
      <summary>
        <span class="terrain-tarif-category-name">${escapeHtml(group.category)}</span>
        <span class="terrain-tarif-count">${total}</span>
      </summary>
      <div class="terrain-tarif-category-content">
        ${group.groups.map(sub => {
          const showSubcategory = !!sub.subcategory;
          if (!showSubcategory) {
            return `<section class="terrain-tarif-subcategory terrain-tarif-subcategory-plain">
              <div class="terrain-tarif-items">${sub.items.map(renderTarifItem).join('')}</div>
            </section>`;
          }
          return `<details class="terrain-tarif-subcategory" ${searching ? 'open' : ''}>
            <summary class="terrain-tarif-subcategory-title">
              <span>${escapeHtml(sub.subcategory)}</span>
              <small>${sub.items.length}</small>
            </summary>
            <div class="terrain-tarif-items">${sub.items.map(renderTarifItem).join('')}</div>
          </details>`;
        }).join('')}
      </div>
    </details>`;
  }).join('');
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
    zones: [],
    observations: [],
    lines: [],
    photos: []
  };
}

function ensureActiveDraft() {
  if (!state.activeDraft) state.activeDraft = makeBlankDraft();
  if (!Array.isArray(state.activeDraft.lines)) state.activeDraft.lines = [];
  if (!Array.isArray(state.activeDraft.photos)) state.activeDraft.photos = [];
  if (!Array.isArray(state.activeDraft.observations)) state.activeDraft.observations = [];
  if (!Array.isArray(state.activeDraft.zones)) state.activeDraft.zones = [];
  if (state.activeZoneId && !state.activeDraft.zones.some(zone => zone.id === state.activeZoneId)) state.activeZoneId = '';
}

function observationLabel(type = 'note') {
  return ({ note: 'Note', measure: 'Mesure', question: 'À vérifier', structuredMeasure: 'Mesure calculée' })[type] || 'Note';
}

function zoneName(draft, zoneId = '') {
  return (draft.zones || []).find(zone => zone.id === zoneId)?.name || 'Général';
}

function formatMeasureNumber(value) {
  return new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

function buildStructuredMeasure(type, a, b, c) {
  const first = Number(a) || 0;
  const second = Number(b) || 0;
  const third = Number(c) || 0;
  if (type === 'surface') return { result: first * second, unit: 'm²', formula: `${formatMeasureNumber(first)} m × ${formatMeasureNumber(second)} m` };
  if (type === 'volume') return { result: first * second * third, unit: 'm³', formula: `${formatMeasureNumber(first)} m × ${formatMeasureNumber(second)} m × ${formatMeasureNumber(third)} m` };
  if (type === 'quantity') return { result: first, unit: 'p', formula: `${formatMeasureNumber(first)} pièce(s)` };
  return { result: first, unit: 'm', formula: `${formatMeasureNumber(first)} m` };
}

function renderVisitFeed(draft) {
  const events = [
    ...(draft.observations || []).map(item => ({ ...item, kind: 'observation', at: item.createdAt || draft.createdAt })),
    ...(draft.lines || []).map(item => ({ ...item, kind: 'line', at: item.createdAt || draft.createdAt })),
    ...(draft.photos || []).map(item => ({ ...item, kind: 'photo', at: item.takenAt || draft.createdAt }))
  ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (!events.length) return '<div class="empty visit-empty">Commence le relevé avec une note, une mesure, une photo ou une prestation.</div>';
  return `<div class="visit-feed">${events.map(event => {
    if (event.kind === 'observation') return `<article class="visit-event visit-event-${escapeHtml(event.type || 'note')}">
      <span class="visit-event-icon">${['measure','structuredMeasure'].includes(event.type) ? '📐' : event.type === 'question' ? '❓' : '📝'}</span>
      <div><small>${escapeHtml(zoneName(draft, event.zoneId))} · ${escapeHtml(observationLabel(event.type))}</small><strong>${escapeHtml(event.text || '')}</strong></div>
      <div class="visit-event-actions">${event.type === 'structuredMeasure' ? `<button type="button" data-action="measure-to-line" data-id="${escapeHtml(event.id)}" title="Créer une ligne de devis">→ Ligne</button>` : ''}<button type="button" data-action="delete-observation" data-id="${escapeHtml(event.id)}" aria-label="Supprimer">×</button></div>
    </article>`;
    if (event.kind === 'photo') return `<article class="visit-event visit-event-photo">
      <span class="visit-event-icon">📷</span><div><small>${escapeHtml(zoneName(draft, event.zoneId))} · Photo</small><strong>${escapeHtml(event.note || event.fileName || 'Photo du relevé')}</strong></div>
    </article>`;
    return `<article class="visit-event visit-event-line">
      <span class="visit-event-icon">🏷️</span><div><small>${escapeHtml(zoneName(draft, event.zoneId))} · Prestation · ${escapeHtml(String(event.qty ?? 1))} ${escapeHtml(event.unit || 'p')}</small><strong>${escapeHtml(event.description || 'Ligne à compléter')}</strong></div><span class="visit-event-price">${money((Number(event.qty)||0) * (Number(event.unitPrice)||0))}</span>
    </article>`;
  }).join('')}</div>`;
}

async function persistActiveDraft(message = '') {
  ensureActiveDraft();
  state.activeDraft.updatedAt = new Date().toISOString();
  const index = state.drafts.findIndex(item => item.id === state.activeDraft.id);
  if (index >= 0) state.drafts[index] = clone(state.activeDraft);
  else state.drafts.unshift(clone(state.activeDraft));
  await saveDrafts();
  if (message) showToast(message);
}

function renderHome() {
  const recentDrafts = state.drafts.slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,2);
  const currentClient = state.data.clients.length;
  const prices = state.data.tarifs.items.length;
  viewRoot.innerHTML = `
    <section class="hero">
      <span class="hero-kicker">Visite commerciale</span>
      <h2>Préparer un devis sur place</h2>
      <p>Relève les besoins, les mesures et les photos pendant la visite. Finalise ensuite le devis dans BastCompta.</p>
      <button class="primary-button" type="button" data-action="start-quote">＋ Commencer une visite</button>
    </section>
    <section class="quick-grid">
      <button class="quick-card" type="button" data-action="nav-clients"><span>👥</span><div><strong>${hasPremiumAccess() ? `${currentClient} client${currentClient === 1 ? '' : 's'}` : 'Suivi client 🔒'}</strong><small>${hasPremiumAccess() ? 'Recherche et suivi' : 'Pack Gestion d’activité'}</small></div></button>
      <button class="quick-card" type="button" data-action="nav-prices"><span>🏷️</span><div><strong>${prices} tarif${prices === 1 ? '' : 's'}</strong><small>Prestations disponibles</small></div></button>
      <button class="quick-card" type="button" data-action="nav-drafts"><span>📄</span><div><strong>${state.drafts.length} brouillon${state.drafts.length === 1 ? '' : 's'}</strong><small>Reprendre un devis</small></div></button>
      <a class="quick-card link-button" href="index.html"><span>🖥️</span><div><strong>Version complète</strong><small>Gestion BastCompta</small></div></a>
    </section>
    ${recentDrafts.length ? `<div class="section-head"><h2>Visites récentes</h2></div><div class="list">${recentDrafts.map(renderDraftCard).join('')}</div>` : ''}
  `;
}

function renderClients() {
  if (!hasPremiumAccess()) {
    viewRoot.innerHTML = `
      <section class="form-card premium-lock-page">
        <div class="premium-lock"><strong>🔒 Pack Gestion d’activité</strong><span>La liste générale des clients, les fiches, notes, chantiers et l’historique font partie du module Suivi client.</span></div>
        <p class="muted">La création d’un devis reste gratuite : la sélection ou l’ajout d’un client reste disponible uniquement pendant la création du devis.</p>
        <button class="primary-button" type="button" data-action="start-quote">Créer un devis gratuit</button>
        <a class="secondary-button link-button" href="index.html">Voir les abonnements dans BastCompta</a>
      </section>`;
    return;
  }
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
  if (!hasPremiumAccess() && !state.activeDraft) { renderClients(); return; }
  const existing = state.selectedClientId ? state.data.clients.find(item => item.id === state.selectedClientId) : null;
  const client = existing || { id: '', name: '', contact: '', email: '', phone: '', address: '', clientNumber: '', vat: '', notes: '', favorite: false };
  viewRoot.innerHTML = `
    <div class="form-card">
      <div class="field"><label for="cfName">Nom du client *</label><input id="cfName" value="${escapeHtml(client.name || '')}"></div>
      <div class="field-row"><div class="field"><label for="cfPhone">Téléphone</label><input id="cfPhone" type="tel" value="${escapeHtml(client.phone || '')}"></div><div class="field"><label for="cfEmail">E-mail</label><input id="cfEmail" type="email" value="${escapeHtml(client.email || '')}"></div></div>
      <div class="field"><label for="cfAddress">Adresse</label><textarea id="cfAddress" rows="2">${escapeHtml(client.address || '')}</textarea></div>
      <div class="field-row"><div class="field"><label for="cfNumber">N° client</label><input id="cfNumber" value="${escapeHtml(client.clientNumber || '')}"></div><div class="field"><label for="cfVat">TVA</label><input id="cfVat" value="${escapeHtml(client.vat || '')}"></div></div>
      <div class="field"><label for="cfContact">Personne de contact</label><input id="cfContact" value="${escapeHtml(client.contact || '')}"></div>
      ${hasPremiumAccess() ? `<div class="field"><label for="cfNotes">Notes / suivi</label><textarea id="cfNotes" rows="4">${escapeHtml(client.notes || '')}</textarea></div>` : `<div class="premium-lock"><strong>🔒 Pack Gestion d’activité</strong><span>Les notes et chantiers restent réservés au module Suivi client.</span></div>`}
      <label class="field"><span>Favori</span><select id="cfFavorite"><option value="0" ${!client.favorite ? 'selected' : ''}>Non</option><option value="1" ${client.favorite ? 'selected' : ''}>Oui</option></select></label>
      <div class="form-actions"><button class="secondary-button" type="button" data-action="cancel-client">Annuler</button><button class="primary-button" type="button" data-action="save-client">Enregistrer</button></div>
    </div>`;
}

function renderClientProjects(client) {
  const key = normalizeText(client.id || client.name || '');
  const projects = (state.chantiers.projects || []).filter(project => {
    const values = [project.clientId, project.clientName, project.customerName, project.title].map(normalizeText);
    return values.some(value => value && (value === key || value.includes(normalizeText(client.name || ''))));
  });
  if (!projects.length) return '<div class="client-note">Aucun chantier lié.</div>';
  return `<div><strong>Chantiers / suivi</strong><div class="list">${projects.slice(0,8).map(project => `<div class="client-note"><strong>${escapeHtml(project.title || project.name || 'Chantier')}</strong><br><small>${escapeHtml(project.status || project.address || '')}</small></div>`).join('')}</div></div>`;
}

function renderClientDetail() {
  if (!hasPremiumAccess()) { renderClients(); return; }
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
      ${hasPremiumAccess() ? `${client.notes ? `<div><strong>Notes</strong><div class="client-note">${escapeHtml(client.notes)}</div></div>` : ''}${renderClientProjects(client)}${renderClientPhotos(client)}` : `<div class="premium-lock"><strong>🔒 Pack Gestion d’activité</strong><span>Coordonnées accessibles gratuitement. Notes, chantiers et historique nécessitent le module Suivi client.</span></div>`}
      <div class="form-actions"><button class="secondary-button" type="button" data-action="edit-client" data-id="${escapeHtml(client.id)}">Modifier</button><button class="primary-button" type="button" data-action="quote-for-client" data-id="${escapeHtml(client.id)}">Nouveau devis</button></div>
    </article>
    <div class="section-head"><h2>Devis terrain (${drafts.length})</h2></div>
    <div class="list">${drafts.length ? drafts.map(renderDraftCard).join('') : '<div class="empty">Aucun devis terrain pour ce client.</div>'}</div>`;
  if (isDriveConnected()) setTimeout(() => hydrateClientPhotos().catch(console.warn), 0);
}

function renderPrices() {
  const items = filteredTarifs();
  const pendingMeasure = state.pendingMeasureId && state.activeDraft
    ? (state.activeDraft.observations || []).find(item => item.id === state.pendingMeasureId)
    : null;
  viewRoot.innerHTML = `
    ${pendingMeasure ? `<div class="measure-price-context"><span>📐</span><div><strong>Choisir la prestation à chiffrer</strong><small>${escapeHtml(pendingMeasure.text || '')}</small></div><button type="button" data-action="cancel-measure-price">Annuler</button></div>` : ''}
    <div class="section-head"><h2>${state.data.tarifs.items.length} prestation${state.data.tarifs.items.length === 1 ? '' : 's'}</h2><button type="button" data-action="open-full-prices">Gérer</button></div>
    <div class="search-row"><input id="priceSearch" class="search-input" type="search" placeholder="Rechercher un poste, une catégorie…" value="${escapeHtml(state.query)}"></div>
    <div class="terrain-tarif-groups">${items.length ? renderTarifGroups(items) : '<div class="empty">Aucun tarif trouvé. Ajoute d’abord tes prestations dans la version complète.</div>'}</div>`;
  bindSearch('#priceSearch');
}

function renderDraftCard(draft) {
  const totals = draftTotals(draft);
  return `<article class="list-card"><div class="list-main" data-action="open-draft" data-id="${escapeHtml(draft.id)}"><strong>${escapeHtml(draft.clientName || 'Client à choisir')}</strong><small>${escapeHtml(draft.siteName || 'Sans objet')} · ${new Date(draft.updatedAt || draft.createdAt).toLocaleDateString('fr-BE')}</small></div><div class="list-actions"><span class="draft-status">${draft.status === 'transferred' ? 'Transféré' : 'Visite'}</span><strong class="price">${money(totals.tvac)}</strong><button class="mini-btn danger" type="button" data-action="delete-draft" data-id="${escapeHtml(draft.id)}" title="Supprimer" aria-label="Supprimer"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></div></article>`;
}

function renderDrafts() {
  const drafts = state.drafts.slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  viewRoot.innerHTML = `<div class="section-head"><h2>${drafts.length} visite${drafts.length === 1 ? '' : 's'}</h2><button type="button" data-action="start-quote">＋ Nouvelle</button></div><div class="list">${drafts.length ? drafts.map(renderDraftCard).join('') : '<div class="empty">Aucune visite enregistrée.</div>'}</div>`;
}

function renderQuoteClient() {
  ensureActiveDraft();
  const clients = state.data.clients.slice().sort((a, b) => {
    if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
    return clientDisplay(a).localeCompare(clientDisplay(b), 'fr', { sensitivity: 'base' });
  });
  viewRoot.innerHTML = `
    <div class="confirm-box"><strong>Nouvelle visite</strong><br><span class="muted">Pour qui prépares-tu le devis ?</span></div>
    <div class="section-head"><h2>Choisir le client</h2><button type="button" data-action="new-client-from-quote">＋ Nouveau</button></div>
    <div class="quote-client-picker" id="quoteClientPicker">
      <button class="quote-client-picker-trigger" type="button" data-action="toggle-client-picker" aria-expanded="false">
        <span><strong>Choisir un client</strong><small>Cliquer pour afficher la liste</small></span><span class="picker-chevron">⌄</span>
      </button>
      <div class="quote-client-picker-panel hidden" id="quoteClientPickerPanel">
        <div class="picker-head"><strong><span id="quoteClientCount">${clients.length}</span> client${clients.length === 1 ? '' : 's'}</strong><button type="button" data-action="new-client-from-quote">＋ Ajouter</button></div>
        <div class="search-row"><input id="quoteClientSearch" class="search-input" type="search" placeholder="Nom, téléphone, adresse…" autocomplete="off"></div>
        <div class="quote-client-picker-list" id="quoteClientPickerList">${clients.length ? clients.map(client => `
          <article class="list-card quote-client-choice" data-client-search="${escapeHtml(normalizeText([clientDisplay(client), client.phone, client.email, client.address].filter(Boolean).join(' ')))}">
            <div class="list-main">
              <strong>${client.favorite ? '★ ' : ''}${escapeHtml(clientDisplay(client))}</strong>
              <small>${escapeHtml(client.phone || client.email || client.address || 'Aucune coordonnée')}</small>
            </div>
            <div class="list-actions"><button class="mini-btn" type="button" data-action="select-quote-client" data-id="${escapeHtml(client.id)}">Devis</button><button class="mini-btn" type="button" data-action="edit-client" data-id="${escapeHtml(client.id)}" aria-label="Modifier le client">✎</button></div>
          </article>`).join('') : '<div class="empty">Aucun client trouvé.</div>'}</div>
      </div>
    </div>`;
  bindQuoteClientPicker();
}

function lineMarkup(row, index) {
  const net = (Number(row.qty)||0) * (Number(row.unitPrice)||0) * (1 - (Number(row.discount)||0)/100);
  return `<article class="line-item" data-line-index="${index}">
    <div class="line-title-row"><input data-line-field="description" value="${escapeHtml(row.description || '')}" placeholder="Description"><button type="button" data-action="remove-line" data-index="${index}" title="Supprimer" aria-label="Supprimer"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></div>
    <div class="line-fields">
      <label>Qté<input type="number" inputmode="decimal" step="0.01" data-line-field="qty" value="${escapeHtml(row.qty ?? 1)}"></label>
      <label>Unité<input data-line-field="unit" value="${escapeHtml(row.unit || 'p')}"></label>
      <label>Prix HT<input type="number" inputmode="decimal" step="0.01" data-line-field="unitPrice" value="${escapeHtml(row.unitPrice ?? 0)}"></label>
      <label>TVA<select data-line-field="vatRate">${[0,6,12,21].map(rate => `<option value="${rate}" ${Number(row.vatRate)===rate?'selected':''}>${rate}%</option>`).join('')}</select></label>
    </div>
    <div class="line-total" data-line-total>${money(net)}</div>
  </article>`;
}

function renderVisitZones(draft) {
  const zones = Array.isArray(draft.zones) ? draft.zones : [];
  return `<div class="visit-zones" aria-label="Zones de la visite">
    <button type="button" data-action="select-zone" data-id="" class="${!state.activeZoneId ? 'is-active' : ''}">Général</button>
    ${zones.map(zone => `<button type="button" data-action="select-zone" data-id="${escapeHtml(zone.id)}" class="${state.activeZoneId === zone.id ? 'is-active' : ''}">${escapeHtml(zone.name)}</button>`).join('')}
    <button type="button" data-action="add-zone" class="visit-zone-add">＋ Zone</button>
  </div>`;
}

function renderZoneQuoteSummary(draft) {
  const groups = new Map();
  (draft.lines || []).forEach(line => {
    const key = line.zoneId || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  });
  if (!groups.size) return '';
  return `<div class="zone-quote-summary">${[...groups.entries()].map(([zoneId, lines]) => `<section>
    <div class="zone-summary-head"><strong>${escapeHtml(zoneName(draft, zoneId))}</strong><span>${lines.length} ligne(s)</span></div>
    ${lines.map(line => `<div class="zone-summary-line"><span>${escapeHtml(line.description || 'Prestation')}</span><small>${escapeHtml(formatMeasureNumber(line.qty))} ${escapeHtml(line.unit || 'p')}</small><strong>${money((Number(line.qty)||0) * (Number(line.unitPrice)||0) * (1 - (Number(line.discount)||0) / 100))}</strong></div>`).join('')}
  </section>`).join('')}</div>`;
}

function renderQuoteLines() {
  ensureActiveDraft();
  const draft = state.activeDraft;
  const client = state.data.clients.find(item => item.id === draft.clientId);
  const favoriteItems = state.favorites.map(id => state.data.tarifs.items.find(item => item.id === id)).filter(Boolean).slice(0,10);
  const totals = draftTotals(draft);
  viewRoot.innerHTML = `
    <div class="visit-progress"><span class="is-done">1 Client</span><span class="is-active">2 Relevé</span><span>3 Résumé</span></div>
    <div class="quote-client"><div><strong>${escapeHtml(clientDisplay(client || draft))}</strong><small class="muted">${escapeHtml(draft.address || 'Adresse non renseignée')}</small></div><button type="button" data-action="change-client">Changer</button></div>
    <div class="field"><label for="siteName">Nom du chantier / objet</label><input id="siteName" placeholder="Ex. Taille de haie et évacuation" value="${escapeHtml(draft.siteName || '')}"></div>
    <div class="section-head visit-zone-head"><h2>Zone du relevé</h2><span class="category-chip">${escapeHtml(zoneName(draft, state.activeZoneId))}</span></div>
    ${renderVisitZones(draft)}
    <section class="visit-capture">
      <div class="section-head"><h2>Relevé de visite</h2><span class="category-chip">${(draft.observations || []).length + draft.lines.length + draft.photos.length} élément(s)</span></div>
      <div class="visit-composer"><textarea id="visitObservation" rows="2" placeholder="Ex. Haie de 18 m, accès étroit, évacuation nécessaire…"></textarea>
        <div class="visit-composer-actions"><button type="button" data-action="add-observation" data-type="note">📝 Note</button><button type="button" data-action="add-observation" data-type="measure">📐 Mesure</button><button type="button" data-action="add-observation" data-type="question">❓ À vérifier</button></div>
      </div>
      <details class="measure-builder">
        <summary>📐 Ajouter une mesure calculée</summary>
        <div class="measure-builder-body">
          <label>Calcul<select id="measureType"><option value="length">Longueur</option><option value="surface">Surface</option><option value="volume">Volume</option><option value="quantity">Quantité</option></select></label>
          <div class="measure-inputs"><label>A<input id="measureA" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"></label><label data-measure-extra="surface">B<input id="measureB" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"></label><label data-measure-extra="volume">C<input id="measureC" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"></label></div>
          <input id="measureLabel" placeholder="Objet, ex. Terrasse arrière">
          <button class="secondary-button" type="button" data-action="add-structured-measure">Calculer et ajouter</button>
        </div>
      </details>
      ${renderVisitFeed(draft)}
    </section>
    <div class="visit-quick-actions"><button type="button" data-action="take-quote-photo">📷<span>Photo</span></button><button type="button" data-action="browse-prices">🏷️<span>Prestation</span></button><button type="button" data-action="add-custom-line">＋<span>Ligne libre</span></button></div>
    <div class="section-head"><h2>Prestations du devis</h2><button type="button" data-action="browse-prices">Voir les tarifs</button></div>
    ${favoriteItems.length ? `<div class="section-head"><h2>Favoris</h2><button type="button" data-action="browse-prices">Tous les tarifs</button></div><div class="favorite-strip">${favoriteItems.map(item => `<button type="button" data-action="add-tarif" data-id="${escapeHtml(item.id)}">＋ ${escapeHtml(item.poste)}</button>`).join('')}</div>` : `<button class="add-line-btn" type="button" data-action="browse-prices">🏷 Choisir dans les tarifs</button>`}
    <div id="quoteLines" class="quote-lines">${draft.lines.length ? draft.lines.map(lineMarkup).join('') : '<div class="empty">Aucune prestation ajoutée.</div>'}</div>
    ${renderQuotePhotos(draft)}
    <div class="totals compact-totals">
      <div class="compact-total-copy">
        <small><span>HTVA <strong id="quoteTotalHtva">${money(totals.htva)}</strong></span><span>TVA <strong id="quoteTotalVat">${money(totals.vat)}</strong></span></small>
        <div><span>Total TVAC</span><strong id="quoteTotalTvac">${money(totals.tvac)}</strong></div>
      </div>
      <div class="quote-actions"><button class="outline" type="button" data-action="save-draft">Enregistrer</button><button class="light" type="button" data-action="quote-next">Continuer</button></div>
    </div>`;
  bindQuoteFields();
  if (isDriveConnected()) setTimeout(() => hydrateClientPhotos().catch(console.warn), 0);
}

function renderQuoteFinal() {
  ensureActiveDraft();
  const totals = draftTotals(state.activeDraft);
  const d = state.activeDraft;
  viewRoot.innerHTML = `
    <div class="visit-progress"><span class="is-done">1 Client</span><span class="is-done">2 Relevé</span><span class="is-active">3 Résumé</span></div>
    <div class="form-card">
      <div class="field-row"><div class="field"><label for="qDate">Date</label><input id="qDate" type="date" value="${escapeHtml(d.date || '')}"></div><div class="field"><label for="qValidity">Validité</label><input id="qValidity" placeholder="30 jours" value="${escapeHtml(d.validity || '')}"></div></div>
      <div class="field"><label for="qAddress">Adresse du chantier</label><textarea id="qAddress" rows="2">${escapeHtml(d.address || '')}</textarea></div>
      <div class="field"><label for="qNotes">Remarques du devis</label><textarea id="qNotes" rows="4" placeholder="Conditions, délai, détails…">${escapeHtml(d.notes || '')}</textarea></div>
      <div class="summary-card visit-summary"><strong>${escapeHtml(d.clientName || 'Client')}</strong><div>${escapeHtml(d.siteName || 'Devis sans objet')}</div><small>${d.lines.length} prestation(s) · ${(d.observations || []).length} note(s) · ${d.photos.length} photo(s)</small><div class="totals-row grand"><span>Total TVAC</span><span>${money(totals.tvac)}</span></div></div>
      ${renderZoneQuoteSummary(d)}
      ${(d.observations || []).length ? `<div><strong>Relevé à reprendre dans le devis</strong><div class="visit-summary-notes">${d.observations.map(item => `<div><span>${escapeHtml(zoneName(d, item.zoneId))} · ${escapeHtml(observationLabel(item.type))}</span>${escapeHtml(item.text)}</div>`).join('')}</div></div>` : ''}
      <button class="secondary-button" type="button" data-action="save-final-draft">Enregistrer comme brouillon</button>
      <button class="primary-button" type="button" data-action="transfer-quote">Transférer vers BastCompta</button>
      <p class="footer-note">Le devis sera placé dans le module Devis complet. Tu pourras ensuite générer le PDF ou l’envoyer comme d’habitude.</p>
    </div>`;
  ['qDate','qValidity','qAddress','qNotes'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      const map = {qDate:'date',qValidity:'validity',qAddress:'address',qNotes:'notes'};
      state.activeDraft[map[id]] = id === 'qDate' ? BastDateInputs.value(el) : el.value;
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

function bindQuoteClientPicker() {
  const input = $('#quoteClientSearch');
  const list = $('#quoteClientPickerList');
  const count = $('#quoteClientCount');
  if (!input || !list) return;
  input.addEventListener('input', () => {
    const query = normalizeText(input.value || '');
    let visible = 0;
    list.querySelectorAll('.quote-client-choice').forEach(card => {
      const matches = !query || String(card.dataset.clientSearch || '').includes(query);
      card.classList.toggle('hidden', !matches);
      if (matches) visible += 1;
    });
    if (count) count.textContent = String(visible);
    let empty = list.querySelector('.picker-empty-filter');
    if (!visible) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'empty picker-empty-filter';
        empty.textContent = 'Aucun client trouvé.';
        list.appendChild(empty);
      }
    } else empty?.remove();
  });
}

function refreshQuoteTotals() {
  const totals = draftTotals(state.activeDraft);
  const htva = $('#quoteTotalHtva');
  const vat = $('#quoteTotalVat');
  const tvac = $('#quoteTotalTvac');
  if (htva) htva.textContent = money(totals.htva);
  if (vat) vat.textContent = money(totals.vat);
  if (tvac) tvac.textContent = money(totals.tvac);
}

function refreshLineTotal(card, row) {
  const net = (Number(row.qty) || 0) * (Number(row.unitPrice) || 0) * (1 - (Number(row.discount) || 0) / 100);
  const total = card.querySelector('[data-line-total]');
  if (total) total.textContent = money(net);
}

function bindQuoteFields() {
  const siteName = $('#siteName');
  siteName?.addEventListener('input', () => { state.activeDraft.siteName = siteName.value; });
  const measureType = $('#measureType');
  const refreshMeasureFields = () => {
    const type = measureType?.value || 'length';
    document.querySelector('[data-measure-extra="surface"]')?.classList.toggle('hidden', !['surface','volume'].includes(type));
    document.querySelector('[data-measure-extra="volume"]')?.classList.toggle('hidden', type !== 'volume');
  };
  measureType?.addEventListener('change', refreshMeasureFields);
  refreshMeasureFields();
  document.querySelectorAll('[data-line-index]').forEach(card => {
    const index = Number(card.dataset.lineIndex);
    card.querySelectorAll('[data-line-field]').forEach(input => {
      const update = () => {
        const field = input.dataset.lineField;
        state.activeDraft.lines[index][field] = ['qty','unitPrice','vatRate','discount'].includes(field) ? Number(input.value) : input.value;
        if (field !== 'description' && field !== 'unit') {
          refreshLineTotal(card, state.activeDraft.lines[index]);
          refreshQuoteTotals();
        }
      };
      input.addEventListener('input', update);
      if (input.tagName === 'SELECT') input.addEventListener('change', update);
    });
  });
}

function addTarifToDraft(id) {
  ensureActiveDraft();
  const item = state.data.tarifs.items.find(t => t.id === id);
  if (!item) return;
  const measure = state.pendingMeasureId
    ? state.activeDraft.observations.find(entry => entry.id === state.pendingMeasureId && entry.type === 'structuredMeasure')
    : null;
  const targetZoneId = measure?.zoneId || state.activeZoneId || '';
  const description = measure
    ? `${item.poste || 'Prestation'} — ${zoneName(state.activeDraft, targetZoneId)}`
    : (item.poste || '');
  state.activeDraft.lines.push({
    description, qty: measure ? (Number(measure.result) || 0) : 1, unit: measure?.unit || tarifUnit(item), unitPrice: tarifPrice(item),
    costPrice: 0, discount: 0, vatRate: Number(item.tva) || 21, tarifId: item.id, zoneId: targetZoneId,
    sourceMeasureId: measure?.id || '', createdAt: new Date().toISOString()
  });
  state.pendingMeasureId = '';
  showToast(measure ? `${item.poste || 'Prestation'} chiffré avec la mesure.` : `${item.poste || 'Prestation'} ajouté`);
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
    notes: hasPremiumAccess() ? ($('#cfNotes')?.value.trim() || existing.notes || '') : (existing.notes || ''), favorite: $('#cfFavorite').value === '1', createdAt: existing.createdAt || new Date().toISOString()
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

async function transferQuoteToMain() {
  ensureActiveDraft();
  const d = state.activeDraft;
  if (!d.clientName) return showToast('Choisis d’abord un client.');
  if (!d.lines.some(line => String(line.description || '').trim())) return showToast('Ajoute au moins une prestation.');
  const oldQuote = state.data.quote || {};
  const terrainDraftId = String(d.id || uid('draft'));
  state.data.quote = {
    ...oldQuote,
    documentNumber: '',
    status: 'draft',
    terrainDraftId,
    transferredFromTerrain: true,
    terrainTransferredAt: new Date().toISOString(),
    clientNumber: d.clientNumber || '', clientVat: d.clientVat || '', clientId: d.clientId || '',
    clientName: d.clientName || '', clientEmail: d.clientEmail || '', address: d.address || '', date: d.date || '',
    validity: d.validity || '', siteName: d.siteName || '', chantierId: '',
    lines: clone(d.lines), suppliesEnabled: false, suppliesLines: [],
    notes: [d.notes || '', ...(d.observations || []).map(item => `${zoneName(d, item.zoneId)} — ${observationLabel(item.type)} : ${item.text}`)].filter(Boolean).join('\n'),
    terrainZones: clone(d.zones || []),
    terrainObservations: clone(d.observations || []),
    photos: clone(Array.isArray(d.photos) ? d.photos : [])
  };
  await saveMainData(true);
  d.status = 'transferred';
  d.transferredAt = new Date().toISOString();
  await persistActiveDraft();
  showToast('Devis transféré dans BastCompta.');
  setTimeout(() => { window.location.href = 'index.html?terrain=1'; }, 650);
}

viewRoot.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === 'start-quote') { state.activeDraft = makeBlankDraft(); setView('quote-client'); }
  else if (action === 'nav-clients') setView('clients');
  else if (action === 'nav-prices') setView('prices');
  else if (action === 'nav-drafts') setView('drafts');
  else if (action === 'new-client') { if (!requirePremium('Le suivi client')) return; state.selectedClientId = ''; setView('client-form'); }
  else if (action === 'new-client-from-quote') { state.selectedClientId = ''; setView('client-form'); }
  else if (action === 'toggle-client-picker') {
    const panel = $('#quoteClientPickerPanel');
    const trigger = target.closest('.quote-client-picker-trigger');
    if (panel && trigger) {
      const willOpen = panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !willOpen);
      trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      if (willOpen) setTimeout(() => $('#quoteClientSearch')?.focus(), 0);
    }
  }
  else if (action === 'edit-client') { if (!requirePremium('Le suivi client')) return; state.selectedClientId = id; setView('client-form'); }
  else if (action === 'client-detail') { if (!requirePremium('Le suivi client')) return; state.selectedClientId = id; setView('client-detail'); }
  else if (action === 'cancel-client') goBack();
  else if (action === 'save-client') saveClientFromForm(!!state.activeDraft);
  else if (action === 'quote-for-client') { const client = state.data.clients.find(c => c.id === id); state.activeDraft = makeBlankDraft(client); setView('quote-lines'); }
  else if (action === 'select-quote-client') selectClientForQuote(id);
  else if (action === 'change-client') setView('quote-client');
  else if (action === 'toggle-favorite') {
    state.favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id];
    writeJson(FAVORITES_KEY, state.favorites); render();
  }
  else if (action === 'add-tarif') { addTarifToDraft(id); await persistActiveDraft(); if (state.view === 'prices') setView('quote-lines', { push: false }); else renderQuoteLines(); }
  else if (action === 'browse-prices') { state.pendingMeasureId = ''; setView('prices'); }
  else if (action === 'cancel-measure-price') { state.pendingMeasureId = ''; setView('quote-lines', { push: false }); }
  else if (action === 'add-zone') {
    ensureActiveDraft();
    const name = String(prompt('Nom de la zone (ex. Terrasse arrière) :', '') || '').trim();
    if (!name) return;
    const zone = { id: uid('zone'), name, createdAt: new Date().toISOString() };
    state.activeDraft.zones.push(zone);
    state.activeZoneId = zone.id;
    await persistActiveDraft();
    renderQuoteLines();
  }
  else if (action === 'select-zone') { state.activeZoneId = id || ''; renderQuoteLines(); }
  else if (action === 'add-custom-line') { ensureActiveDraft(); state.activeDraft.lines.push({ description:'', qty:1, unit:'p', unitPrice:0, costPrice:0, discount:0, vatRate:21, zoneId:state.activeZoneId || '', createdAt:new Date().toISOString() }); renderQuoteLines(); }
  else if (action === 'add-observation') {
    ensureActiveDraft();
    const input = $('#visitObservation');
    const text = String(input?.value || '').trim();
    if (!text) { input?.focus(); return showToast('Écris d’abord ton relevé.'); }
    state.activeDraft.observations.unshift({ id: uid('obs'), type: target.dataset.type || 'note', text, zoneId: state.activeZoneId || '', createdAt: new Date().toISOString() });
    await persistActiveDraft();
    renderQuoteLines();
  }
  else if (action === 'delete-observation') {
    ensureActiveDraft();
    state.activeDraft.observations = state.activeDraft.observations.filter(item => item.id !== id);
    await persistActiveDraft();
    renderQuoteLines();
  }
  else if (action === 'add-structured-measure') {
    ensureActiveDraft();
    const type = $('#measureType')?.value || 'length';
    const a = Number($('#measureA')?.value);
    const b = Number($('#measureB')?.value);
    const c = Number($('#measureC')?.value);
    if (!(a > 0) || (['surface','volume'].includes(type) && !(b > 0)) || (type === 'volume' && !(c > 0))) return showToast('Complète les dimensions nécessaires.');
    const calculated = buildStructuredMeasure(type, a, b, c);
    const label = String($('#measureLabel')?.value || '').trim();
    const text = `${label ? `${label} : ` : ''}${calculated.formula} = ${formatMeasureNumber(calculated.result)} ${calculated.unit}`;
    state.activeDraft.observations.unshift({ id: uid('measure'), type: 'structuredMeasure', measureType: type, a, b, c, result: calculated.result, unit: calculated.unit, text, zoneId: state.activeZoneId || '', createdAt: new Date().toISOString() });
    await persistActiveDraft();
    renderQuoteLines();
  }
  else if (action === 'measure-to-line') {
    ensureActiveDraft();
    const measure = state.activeDraft.observations.find(item => item.id === id && item.type === 'structuredMeasure');
    if (!measure) return;
    state.pendingMeasureId = measure.id;
    setView('prices');
  }
  else if (action === 'remove-line') { state.activeDraft.lines.splice(Number(target.dataset.index),1); renderQuoteLines(); }
  else if (action === 'save-draft') { state.activeDraft.siteName = $('#siteName')?.value || state.activeDraft.siteName; await persistActiveDraft('Visite enregistrée.'); }
  else if (action === 'quote-next') { state.activeDraft.siteName = $('#siteName')?.value || state.activeDraft.siteName; if (!state.activeDraft.lines.length) return showToast('Ajoute au moins une prestation.'); await persistActiveDraft(); setView('quote-final'); }
  else if (action === 'save-final-draft') { await persistActiveDraft('Visite enregistrée.'); setView('drafts'); }
  else if (action === 'transfer-quote') transferQuoteToMain();
  else if (action === 'open-draft') { const draft = state.drafts.find(d => d.id === id); if (draft) { state.activeDraft = clone(draft); setView('quote-lines'); } }
  else if (action === 'delete-draft') { if (confirm('Supprimer ce brouillon ?')) { state.drafts = state.drafts.filter(d => d.id !== id); saveDrafts(); render(); } }
  else if (action === 'take-quote-photo') { state.photoTarget = 'quote'; document.getElementById('terrainCameraInput')?.click(); }
  else if (action === 'choose-quote-photo') { state.photoTarget = 'quote'; document.getElementById('terrainGalleryInput')?.click(); }
  else if (action === 'connect-drive-for-quote-photos') { if (await connectAndSyncDrive(true)) renderQuoteLines(); }
  else if (action === 'open-quote-photo') { ensureActiveDraft(); await openQuotePhoto(state.activeDraft, id); }
  else if (action === 'delete-quote-photo') {
    ensureActiveDraft();
    if (confirm('Supprimer définitivement cette photo du devis ?')) {
      try { await deleteQuotePhoto(state.activeDraft, id); showToast('Photo supprimée du devis.'); renderQuoteLines(); }
      catch (error) { console.error(error); showToast(error.message || 'Suppression impossible.'); }
    }
  }
  else if (action === 'take-client-photo') { state.photoTarget = 'client'; document.getElementById('terrainCameraInput')?.click(); }
  else if (action === 'choose-client-photo') { state.photoTarget = 'client'; document.getElementById('terrainGalleryInput')?.click(); }
  else if (action === 'connect-drive-for-photos') { if (await connectAndSyncDrive(true)) renderClientDetail(); }
  else if (action === 'open-client-photo') { const client = state.data.clients.find(item => item.id === state.selectedClientId); if (client) await openClientPhoto(client, id); }
  else if (action === 'delete-client-photo') {
    const client = state.data.clients.find(item => item.id === state.selectedClientId);
    if (client && confirm('Supprimer définitivement cette photo ?')) {
      try { await deleteClientPhoto(client, id); showToast('Photo supprimée.'); renderClientDetail(); }
      catch (error) { console.error(error); showToast(error.message || 'Suppression impossible.'); }
    }
  }
  else if (action === 'open-full-prices') window.location.href = 'gestion-commerciale.html';
});

document.addEventListener('change', event => {
  if (event.target?.id === 'terrainCameraInput' || event.target?.id === 'terrainGalleryInput') {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (state.photoTarget === 'quote') handleQuotePhotoFiles(files); else handleClientPhotoFiles(files);
  }
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

function updateAccountPermissionsUi() {
  const connect = $('#connectDriveBtn');
  const sync = $('#syncDriveBtn');
  const premium = hasPremiumAccess();
  if (connect) {
    connect.disabled = false;
    connect.textContent = isDriveConnected() ? 'Google Drive connecté' : 'Connecter Google Drive';
  }
  if (sync) sync.disabled = false;
  const clientNav = bottomNav?.querySelector('[data-nav="clients"] small');
  if (clientNav) clientNav.textContent = premium ? 'Clients' : 'Clients 🔒';
}

const accountMenu = $('#terrainAccountMenu');
$('#terrainAccountBtn').addEventListener('click', () => { updateAccountPermissionsUi(); accountMenu.classList.remove('hidden'); });
$('#closeAccountBtn').addEventListener('click', () => accountMenu.classList.add('hidden'));
$('#terrainLogoutBtn').addEventListener('click', async () => { accountMenu.classList.add('hidden'); await signOut(auth); });
$('#terrainSubscriptionLogoutBtn')?.addEventListener('click', async () => { await signOut(auth); });
$('#reloadDataBtn').addEventListener('click', async () => { await loadAllData(); accountMenu.classList.add('hidden'); render(); showToast('Données BastCompta rechargées.'); });
$('#connectDriveBtn')?.addEventListener('click', async () => { accountMenu.classList.add('hidden'); await connectAndSyncDrive(true); });
$('#syncDriveBtn')?.addEventListener('click', async () => { accountMenu.classList.add('hidden'); if (!isDriveConnected()) await connectAndSyncDrive(true); else await syncFromDrive(); });

window.addEventListener('storage', event => {
  if ([STORAGE_KEY, DRAFTS_KEY, FAVORITES_KEY].includes(event.key)) { loadAllData(); render(); }
});

document.addEventListener('visibilitychange', async () => { if (!document.hidden && state.currentUser) { await loadAllData(); render(); } });

onAuthStateChanged(auth, async user => {
  state.currentUser = user;
  try {
    if (user) {
      await checkSubscription(user);
      if (!hasPremiumAccess()) {
        showOnly(subscriptionScreen);
        return;
      }
      await loadAllData();
      $('#terrainUserEmail').textContent = `${user.email || 'Compte BastCompta'} · Suivi client actif`;
      setAuthMessage('');
      showOnly(appScreen);
      state.view = 'home'; state.history = []; state.activeDraft = null;
      render();
      updateAccountPermissionsUi();
      updateSyncLine('Données locales BastCompta chargées', 'ok');
      if (localStorage.getItem(GOOGLE_WAS_CONNECTED_KEY) === '1') setTimeout(() => connectAndSyncDrive(false), 700);
    } else {
      passwordInput.value = '';
      showOnly(authScreen);
    }
  } catch (error) {
    console.error('Initialisation Terrain impossible', error);
    showOnly(authScreen);
    setAuthMessage('Impossible de charger Mode terrain. Recharge la page ou reconnecte-toi.', 'error');
  }
}, error => {
  console.error('Connexion Firebase Terrain impossible', error);
  showOnly(authScreen);
  setAuthMessage('Connexion à BastCompta impossible. Vérifie ta connexion internet.', 'error');
});
