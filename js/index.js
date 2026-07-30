// Portail BastCompta - script principal

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDK3VeC-TOfXliPrY9IrHN0tFPf7KEm_j0",
  authDomain: "bastcompta-3aa41.firebaseapp.com",
  projectId: "bastcompta-3aa41",
  storageBucket: "bastcompta-3aa41.firebasestorage.app",
  messagingSenderId: "724620573737",
  appId: "1:724620573737:web:b44e0d3f8b1cbf382b3038"
};

const GOOGLE_CLIENT_ID = '724620573737-7o7bc9rn9r97r8fhqsfvlcl9dtaa7d7c.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyC88moDvAWg7LFeJAgUSxXJV4nhAigSOKU';
const DRIVE_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';

const GOOGLE_WAS_CONNECTED_KEY = 'bastcompta_google_was_connected';
const TOKEN_EXPIRY_SAFETY_MS = 60 * 1000;

let googleTokenClient = null;
let googleAccessToken = null;
let googleTokenExpiresAt = 0;
let googleDriveReady = false;
let googleRequestInFlight = null;
let silentReconnectAttempted = false;
let hiddenDriveFilesCache = [];
let hiddenDriveActiveCategory = 'all';

const authScreen = document.getElementById('authScreen');
const portalScreen = document.getElementById('portalScreen');
const authMessage = document.getElementById('authMessage');
const currentUserEl = document.getElementById('currentUser');
const globalSaveBtn = document.getElementById('globalSaveBtn');
const syncStatusPill = document.getElementById('syncStatusPill');
const syncStatusText = document.getElementById('syncStatusText');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const sendVerificationBtn = document.getElementById('sendVerificationBtn');
const logoutBtn = document.getElementById('logoutBtn');
const connectDriveBtn = document.getElementById('connectDriveBtn');
const disconnectDriveBtn = document.getElementById('disconnectDriveBtn');
const settingsMenu = document.getElementById('settingsMenu');
const settingsMenuBtn = document.getElementById('settingsMenuBtn');
const hiddenDriveBtn = document.getElementById('hiddenDriveBtn');
const hiddenDriveModal = document.getElementById('hiddenDriveModal');
const closeHiddenDriveBtn = document.getElementById('closeHiddenDriveBtn');
const refreshHiddenDriveBtn = document.getElementById('refreshHiddenDriveBtn');
const hiddenDriveStatus = document.getElementById('hiddenDriveStatus');
const hiddenDriveList = document.getElementById('hiddenDriveList');
const hiddenDriveTabs = document.getElementById('hiddenDriveTabs');
const fullBackupBtn = document.getElementById('fullBackupBtn');
const fullRestoreBtn = document.getElementById('fullRestoreBtn');
const fullRestoreInput = document.getElementById('fullRestoreInput');
const backupOverlay = document.getElementById('backupOverlay');
const backupOverlayTitle = document.getElementById('backupOverlayTitle');
const backupOverlayText = document.getElementById('backupOverlayText');
const devisFrame = document.getElementById('devisFrame');
const terrainFrame = document.getElementById('terrainFrame');
const comptaFrame = document.getElementById('comptaFrame');
const chantierFrame = document.getElementById('chantierFrame');
const impotsFrame = document.getElementById('impotsFrame');
const tarifsFrame = document.getElementById('tarifsFrame');
const subscriptionModal = document.getElementById('subscriptionModal');
const subscriptionModalTitle = document.getElementById('subscriptionModalTitle');
const subscriptionModalText = document.getElementById('subscriptionModalText');
const subscriptionCommunication = document.getElementById('subscriptionCommunication');
const closeSubscriptionModalBtn = document.getElementById('closeSubscriptionModalBtn');
let activateTrialBtn = null;
const authTabs = Array.from(document.querySelectorAll('.auth-tab'));
const mainTabs = Array.from(document.querySelectorAll('.main-tab'));

const FREE_MAIN_TABS = ['devis', 'tarifs', 'terrain'];
const MODULE_PACK_BY_TAB = { compta: 'accounting', impots: 'accounting', chantier: 'client' };
const SUBSCRIPTION_PACKS = {
  accounting: { label: 'Pack Comptabilité', shortLabel: 'Comptabilité', code: 'COMPTA' },
  client: { label: 'Pack Suivi client', shortLabel: 'Suivi client', code: 'CLIENT' },
  premium: { label: 'Premium complet', shortLabel: 'Premium', code: 'PREMIUM' }
};
const SUBSCRIPTION_PRICES = {
  accounting: { monthly: 2.99, quarterly: 7.99, yearly: 29.99 },
  client: { monthly: 2.49, quarterly: 6.49, yearly: 24.99 },
  premium: { monthly: 4.99, quarterly: 12.99, yearly: 49.99 }
};
let currentSubscriptionState = { allowed: false, status: 'unknown', access: { accounting: false, client: false, premium: false }, data: null };


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]));
}

function ensureSubscriptionModalStyles() {
  if (document.getElementById('bastcompta-subscription-styles')) return;

  const style = document.createElement('style');
  style.id = 'bastcompta-subscription-styles';
  style.textContent = `
    .subscription-status-box {
      float: right;
      max-width: 280px;
      margin: 0 0 16px 20px;
      padding: 14px 16px;
      border: 1px solid #bfdbfe;
      border-radius: 14px;
      background: #eff6ff;
      color: #1e3a8a;
      text-align: left;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.10);
    }
    .subscription-status-box strong {
      display: block;
      margin-bottom: 4px;
      color: #1d4ed8;
      font-size: 1.05rem;
    }
    .subscription-info-text {
      margin: 0 0 18px;
      line-height: 1.65;
    }
    .trial-activation-box {
      clear: both;
      margin: 18px 0 8px;
      padding: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      background: #ffffff;
    }
    .trial-activation-box h3 {
      margin: 0 0 8px;
      font-size: 1.05rem;
    }
    .trial-activation-box p {
      margin: 0 0 12px;
    }
    .trial-activation-box button {
      border: 0;
      border-radius: 10px;
      padding: 10px 16px;
      background: #2563eb;
      color: #ffffff;
      font-weight: 700;
      cursor: pointer;
    }
    .trial-activation-box button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    @media (max-width: 720px) {
      .subscription-status-box {
        float: none;
        max-width: none;
        margin: 0 0 14px;
      }
    }
  `;
  document.head.appendChild(style);
}

function getUserPseudo(user = auth.currentUser, data = null) {
  const raw =
    data?.pseudo ||
    data?.displayName ||
    user?.displayName ||
    user?.email ||
    'Utilisateur';

  return String(raw).includes('@')
    ? String(raw).split('@')[0]
    : String(raw);
}

function parseDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSubscriptionEntryActive(entry, now = new Date()) {
  if (entry === true) return true;
  if (!entry || typeof entry !== 'object') return false;
  if (entry.active === false || ['inactive', 'expired', 'cancelled'].includes(entry.status)) return false;
  const endValue = entry.endsAt || entry.subscriptionEndsAt;
  if (!endValue) return entry.active === true || entry.status === 'active';
  const end = parseDate(endValue);
  return !!end && now <= end;
}

function getAccessMap(data = {}, status = data.subscriptionStatus || 'free') {
  const access = { accounting: false, client: false, premium: false };
  const now = new Date();

  if (status === 'owner' && data.subscriptionActive === true) {
    return { accounting: true, client: true, premium: true };
  }

  if (status === 'trial' && data.subscriptionActive === true) {
    const trialEnd = parseDate(data.trialEndsAt);
    if (trialEnd && now <= trialEnd) return { accounting: true, client: true, premium: true };
  }

  // Compatibilité avec les abonnements complets déjà présents dans Firebase.
  if (status === 'active' && data.subscriptionActive === true) {
    const legacyEnd = parseDate(data.subscriptionEndsAt);
    if (legacyEnd && now <= legacyEnd) return { accounting: true, client: true, premium: true };
  }

  const subscriptions = data.subscriptions || {};
  access.premium = isSubscriptionEntryActive(subscriptions.premium, now);
  access.accounting = access.premium || isSubscriptionEntryActive(subscriptions.accounting, now);
  access.client = access.premium || isSubscriptionEntryActive(subscriptions.client, now);

  // Champs simples acceptés pour faciliter l'administration Firebase.
  const modules = Array.isArray(data.subscriptionModules) ? data.subscriptionModules : [];
  if (modules.includes('premium')) access.premium = access.accounting = access.client = true;
  if (modules.includes('accounting')) access.accounting = true;
  if (modules.includes('client')) access.client = true;
  if (data.entitlements?.premium === true) access.premium = access.accounting = access.client = true;
  if (data.entitlements?.accounting === true) access.accounting = true;
  if (data.entitlements?.client === true) access.client = true;

  return access;
}

function hasFullAccess(subscription = currentSubscriptionState) {
  return subscription?.access?.premium === true || ['owner', 'trial'].includes(subscription?.status);
}

function hasModuleAccess(tabName, subscription = currentSubscriptionState) {
  if (isFreeTab(tabName)) return true;
  const requiredPack = MODULE_PACK_BY_TAB[tabName];
  return requiredPack ? subscription?.access?.[requiredPack] === true : false;
}

function isFreeTab(tabName) {
  return FREE_MAIN_TABS.includes(tabName);
}

function statusLabel(subscription = currentSubscriptionState) {
  const data = subscription?.data || {};

  if (subscription?.status === 'owner' || data.subscriptionStatus === 'owner') return 'Propriétaire';
  if (subscription?.status === 'trial') {
    const end = parseDate(data.trialEndsAt);
    const daysLeft = end ? Math.max(0, Math.ceil((end - new Date()) / 86400000)) : null;
    return daysLeft === null ? 'Essai gratuit 30 jours' : `Essai gratuit · ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`;
  }

  const active = [];
  if (subscription?.access?.premium) active.push('Premium complet');
  else {
    if (subscription?.access?.accounting) active.push('Pack Comptabilité');
    if (subscription?.access?.client) active.push('Pack Suivi client');
  }
  return active.length ? active.join(' + ') : 'Gratuit';
}

function updateCurrentUserDisplay(user = auth.currentUser, subscription = currentSubscriptionState) {
  if (!currentUserEl) return;
  currentUserEl.textContent = getUserPseudo(user, subscription?.data);
  currentUserEl.title = 'Voir mon statut et les abonnements';
  currentUserEl.style.cursor = 'pointer';
}

function showLockedPaidFeatureMessage() {
  showSubscriptionModal(currentSubscriptionState);
}


function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function setMessage(text, type = '') {
  authMessage.textContent = text;
  authMessage.className = 'message' + (type ? ' ' + type : '');
}

function switchAuthTab(tabName) {
  authTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.authTab === tabName));
  loginForm.classList.toggle('hidden', tabName !== 'login');
  registerForm.classList.toggle('hidden', tabName !== 'register');
  setMessage('');
}

function switchMainTab(tabName) {
  if (!hasModuleAccess(tabName)) {
    showLockedPaidFeatureMessage();
    tabName = 'devis';
  }

  mainTabs.forEach(btn => {
    const isActive = btn.dataset.mainTab === tabName;
    const isLocked = !hasModuleAccess(btn.dataset.mainTab);

    btn.classList.toggle('active', isActive);
    btn.classList.toggle('locked', isLocked);
    btn.disabled = false;
    const requiredPack = MODULE_PACK_BY_TAB[btn.dataset.mainTab];
    btn.title = isLocked
      ? `${SUBSCRIPTION_PACKS[requiredPack]?.label || 'Abonnement'} requis`
      : '';
  });

  document.getElementById('panel-devis').classList.toggle('active', tabName === 'devis');
  document.getElementById('panel-terrain')?.classList.toggle('active', tabName === 'terrain');
  document.getElementById('panel-compta').classList.toggle('active', tabName === 'compta');
  document.getElementById('panel-chantier').classList.toggle('active', tabName === 'chantier');
  document.getElementById('panel-impots').classList.toggle('active', tabName === 'impots');
}

function humanizeAuthError(error) {
  const code = error?.code || '';
  const map = {
    'auth/email-already-in-use': 'Cette adresse mail est déjà utilisée.',
    'auth/invalid-email': 'Adresse mail invalide.',
    'auth/missing-password': 'Merci de saisir un mot de passe.',
    'auth/weak-password': 'Le mot de passe est trop faible.',
    'auth/invalid-credential': 'Adresse mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Adresse mail ou mot de passe incorrect.',
    'auth/wrong-password': 'Adresse mail ou mot de passe incorrect.',
    'auth/too-many-requests': 'Trop de tentatives. Réessaie plus tard.',
    'auth/network-request-failed': 'Erreur réseau. Vérifie ta connexion.',
    'auth/missing-email': 'Merci de saisir une adresse mail.',
    'auth/user-disabled': 'Ce compte a été désactivé.',
    'auth/configuration-not-found': 'La configuration Firebase est incomplète ou le domaine n’est pas autorisé.'
  };
  return map[code] || 'Une erreur est survenue. Vérifie la configuration Firebase.';
}

function isTokenFresh() {
  return !!googleAccessToken && Date.now() < (googleTokenExpiresAt - TOKEN_EXPIRY_SAFETY_MS);
}

function markDriveConnected() {
  localStorage.setItem(GOOGLE_WAS_CONNECTED_KEY, '1');
}

function clearDriveConnectionFlag() {
  localStorage.removeItem(GOOGLE_WAS_CONNECTED_KEY);
}

function wasDrivePreviouslyConnected() {
  return localStorage.getItem(GOOGLE_WAS_CONNECTED_KEY) === '1';
}

async function getGoogleDriveEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: 'Bearer ' + accessToken
    }
  });

  if (!res.ok) {
    throw new Error('Impossible de vérifier le compte Google Drive.');
  }

  const profile = await res.json();
  return normalizeEmail(profile.email);
}

async function validateDriveAccountForCurrentUser(accessToken) {
  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error('Utilisateur BastCompta non connecté.');
  }

  const driveEmail = await getGoogleDriveEmail(accessToken);
  if (!driveEmail) {
    throw new Error('Adresse email Google Drive introuvable.');
  }

  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};

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
    disconnectGoogleDrive(true);
    throw new Error(
      'Ce compte BastCompta est déjà lié au Google Drive : ' + savedDriveEmail
    );
  }

  return driveEmail;
}

function updateDriveButtons() {
  const connected = isTokenFresh();
  connectDriveBtn.textContent = connected ? 'Google Drive connecté' : 'Connecter Google Drive';
  connectDriveBtn.disabled = connected || !googleDriveReady;
  disconnectDriveBtn.disabled = !connected && !wasDrivePreviouslyConnected();
}

function grantPortalModuleAccess() {
  try {
    sessionStorage.setItem('bastcompta_portal_access', 'granted');
    sessionStorage.setItem('bastcompta_subscription_access', JSON.stringify(currentSubscriptionState?.access || {}));
  } catch (error) {
    console.warn('SessionStorage indisponible pour BastCompta.', error);
  }
}

function revokePortalModuleAccess() {
  try {
    sessionStorage.removeItem('bastcompta_portal_access');
    sessionStorage.removeItem('bastcompta_subscription_access');
  } catch (error) {
    console.warn('SessionStorage indisponible pour BastCompta.', error);
  }
}

function loadProtectedFrames(subscription = currentSubscriptionState) {
  try { sessionStorage.setItem('bastcompta_subscription_access', JSON.stringify(subscription?.access || {})); } catch (error) {}
  [
    { tab: 'devis', frame: devisFrame },
    { tab: 'terrain', frame: terrainFrame },
    { tab: 'compta', frame: comptaFrame },
    { tab: 'chantier', frame: chantierFrame },
    { tab: 'impots', frame: impotsFrame },
    { tab: 'tarifs', frame: tarifsFrame }
  ].forEach(({ tab, frame }) => {
    if (!frame) return;

    const targetSrc = frame.dataset.src || '';
    const canLoad = hasModuleAccess(tab, subscription);

    if (!canLoad) {
      frame.setAttribute('src', 'about:blank');
      return;
    }

    if (targetSrc && (!frame.getAttribute('src') || frame.getAttribute('src') === 'about:blank')) {
      frame.setAttribute('src', targetSrc);
    }
  });
}

function unloadProtectedFrames() {
  [devisFrame, terrainFrame, comptaFrame, chantierFrame, impotsFrame, tarifsFrame].forEach(frame => {
    if (!frame) return;
    frame.setAttribute('src', 'about:blank');
  });
}

function showPortal(user, subscription = currentSubscriptionState) {
  currentSubscriptionState = subscription || currentSubscriptionState;

  grantPortalModuleAccess();
  loadProtectedFrames(currentSubscriptionState);
  authScreen.classList.add('hidden');
  portalScreen.classList.remove('hidden');
  document.body.classList.add('portal-active');

  requestAnimationFrame(() => {
    syncResponsiveNavigation();
    window.dispatchEvent(new Event('resize'));
  });

  setTimeout(() => {
    syncResponsiveNavigation();
    window.dispatchEvent(new Event('resize'));
  }, 150);

  updateCurrentUserDisplay(user, currentSubscriptionState);
  switchMainTab('devis');

  sendVerificationBtn.style.display = user.emailVerified ? 'none' : 'inline-flex';
  updateDriveButtons();

  if (wasDrivePreviouslyConnected()) {
    maybeRestoreDriveConnection();
  }
}

function showAuth() {
  revokePortalModuleAccess();
  unloadProtectedFrames();
  portalScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  document.body.classList.remove('portal-active');
  loginForm.reset();
  registerForm.reset();
}

function getFrameOrigin(frame) {
  try {
    const origin = new URL(frame?.src || '', window.location.href).origin;
    if (!origin || origin === 'null') return window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';
    return origin;
  } catch {
    return window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';
  }
}

function postToFrame(frame, message) {
  try {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(message, getFrameOrigin(frame));
  } catch (error) {
    console.warn('Message module ignoré.', error);
  }
}

function getFrameApi(frame, functionName) {
  try {
    const directApi = frame?.contentWindow?.[functionName];
    if (typeof directApi === 'function') return directApi;

    const moduleApi = frame?.contentWindow?.BastComptaModule?.[functionName];
    return typeof moduleApi === 'function' ? moduleApi : null;
  } catch (error) {
    console.warn('Accès iframe impossible :', error);
    return null;
  }
}

function getFrameModuleSaveApi(frame) {
  try {
    const moduleSave = frame?.contentWindow?.BastComptaModule?.save;
    if (typeof moduleSave === 'function') return moduleSave;

    const legacySave = frame?.contentWindow?.saveData;
    return typeof legacySave === 'function' ? legacySave : null;
  } catch (error) {
    console.warn('Accès sauvegarde iframe impossible :', error);
    return null;
  }
}

function getLoadedModuleFrames() {
  return [
    { key: 'devis-facture', label: 'Devis & Facture', frame: devisFrame },
    { key: 'tarifs', label: 'Tarifs', frame: tarifsFrame },
    { key: 'comptabilite', label: 'Comptabilité', frame: comptaFrame },
    { key: 'suivi-client', label: 'Suivi client', frame: chantierFrame },
    { key: 'impots', label: 'Impôts IPP', frame: impotsFrame }
  ].filter(item => {
    if (!item.frame) return false;
    const src = item.frame.getAttribute('src') || '';
    return src && src !== 'about:blank';
  });
}

const moduleSyncState = new Map();
let portalSyncInProgress = false;

function getModuleSyncState(key) {
  if (!moduleSyncState.has(key)) {
    moduleSyncState.set(key, {
      dirty: false,
      syncedOnce: false,
      syncing: false,
      error: '',
      changes: [],
      baselineSnapshot: null,
      snapshotTimer: null
    });
  }
  return moduleSyncState.get(key);
}

function stableSnapshotString(value) {
  const seen = new WeakSet();
  const ignoredTechnicalKeys = new Set([
    'updatedAt', 'modifiedAt', 'lastModified', 'lastSave', 'lastSavedAt',
    'savedAt', 'syncedAt', 'lastSyncAt', 'lastAddedFromTarifs'
  ]);
  const normalize = input => {
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input)) return '[Circular]';
    seen.add(input);
    if (Array.isArray(input)) return input.map(normalize);
    return Object.keys(input).sort().reduce((out, key) => {
      if (ignoredTechnicalKeys.has(key)) return out;
      const item = input[key];
      if (typeof item !== 'function' && typeof item !== 'undefined') out[key] = normalize(item);
      return out;
    }, {});
  };
  try { return JSON.stringify(normalize(value)); }
  catch (error) {
    console.warn('Empreinte de modification impossible.', error);
    return null;
  }
}

function readModuleSnapshot(key) {
  const moduleInfo = getLoadedModuleFrames().find(item => item.key === key);
  try {
    const api = moduleInfo?.frame?.contentWindow?.BastComptaModule;
    if (!api || typeof api.getChangeSnapshot !== 'function') return null;
    return stableSnapshotString(api.getChangeSnapshot());
  } catch (error) {
    console.warn('Lecture de l’état du module impossible :', key, error);
    return null;
  }
}

function captureModuleBaseline(key) {
  const snapshot = readModuleSnapshot(key);
  if (snapshot === null) return false;
  const state = getModuleSyncState(key);
  state.baselineSnapshot = snapshot;
  return true;
}

function evaluateModuleDifference(key, detail = '') {
  const state = getModuleSyncState(key);
  if (state.syncing) return;
  const currentSnapshot = readModuleSnapshot(key);
  if (currentSnapshot === null) {
    markModuleDirty(key, detail);
    return;
  }
  if (state.baselineSnapshot === null) {
    state.baselineSnapshot = currentSnapshot;
    updateSyncStatusIndicator();
    return;
  }
  if (currentSnapshot === state.baselineSnapshot) {
    state.dirty = false;
    state.error = '';
    state.changes = [];
  } else {
    state.dirty = true;
    state.error = '';
    if (detail) addModuleChange(key, detail);
  }
  updateSyncStatusIndicator();
}

function scheduleModuleDifferenceCheck(key, detail = '') {
  const state = getModuleSyncState(key);
  clearTimeout(state.snapshotTimer);
  state.snapshotTimer = setTimeout(() => {
    state.snapshotTimer = null;
    evaluateModuleDifference(key, detail);
  }, 250);
}

function updateSyncStatusIndicator() {
  if (!syncStatusPill || !syncStatusText) return;
  const loaded = getLoadedModuleFrames();
  const states = loaded.map(item => getModuleSyncState(item.key));
  const hasError = states.some(state => !!state.error);
  const isSyncing = portalSyncInProgress || states.some(state => state.syncing);
  const dirtyCount = states.reduce((total, state) => total + (state.dirty ? Math.max(1, state.changes?.length || 0) : 0), 0);

  syncStatusPill.classList.remove('sync-ok', 'sync-pending', 'sync-error', 'sync-unknown');
  if (hasError) {
    syncStatusPill.classList.add('sync-error');
    syncStatusText.textContent = 'Erreur Drive';
    syncStatusPill.title = 'Une sauvegarde a échoué. Cliquez pour relancer.';
  } else if (isSyncing) {
    syncStatusPill.classList.add('sync-pending');
    syncStatusText.textContent = 'Synchronisation…';
    syncStatusPill.title = 'Sauvegarde locale et synchronisation Drive en cours.';
  } else if (dirtyCount > 0) {
    syncStatusPill.classList.add('sync-pending');
    syncStatusText.textContent = `${dirtyCount} modification${dirtyCount > 1 ? 's' : ''}`;
    syncStatusPill.title = 'Des modifications ne sont pas encore confirmées sur Drive.';
  } else if (states.length && states.every(state => state.syncedOnce)) {
    syncStatusPill.classList.add('sync-ok');
    syncStatusText.textContent = 'Synchronisé';
    syncStatusPill.title = 'Toutes les données des modules ouverts sont sauvegardées.';
  } else {
    syncStatusPill.classList.add('sync-unknown');
    syncStatusText.textContent = 'À vérifier';
    syncStatusPill.title = 'Cliquez sur la disquette pour confirmer la sauvegarde.';
  }
}

function addModuleChange(key, detail) {
  const state = getModuleSyncState(key);
  if (state.syncing) return;
  const text = String(detail || 'Donnée modifiée').trim();
  if (!text) return;
  state.changes = Array.isArray(state.changes) ? state.changes : [];
  const previous = state.changes[state.changes.length - 1];
  if (!previous || previous.text !== text) {
    state.changes.push({ text, at: new Date().toISOString() });
    if (state.changes.length > 50) state.changes.splice(0, state.changes.length - 50);
  }
}

function markModuleDirty(key, detail = '') {
  const state = getModuleSyncState(key);
  if (state.syncing) return;
  state.dirty = true;
  state.error = '';
  if (detail) addModuleChange(key, detail);
  updateSyncStatusIndicator();
}

// API appelée explicitement par les modules lorsqu'une action métier
// ajoute, modifie ou supprime réellement une donnée.
window.BastComptaPortal = Object.assign(window.BastComptaPortal || {}, {
  markChanged(moduleKey, detail, beforeSnapshot = null) {
    const state = getModuleSyncState(moduleKey);

    // Le module peut fournir l’état exact juste AVANT la première action de
    // l’utilisateur. Cela évite qu’un chargement asynchrone (Drive, tarifs,
    // calculs automatiques...) rende la référence du portail périmée.
    if (!state.dirty && beforeSnapshot !== null) {
      const candidate = stableSnapshotString(beforeSnapshot);
      if (candidate !== null) state.baselineSnapshot = candidate;
    }

    // La comparaison est regroupée sur 250 ms pour rester imperceptible.
    // Si l’utilisateur remet exactement les valeurs d’origine, l’indicateur disparaît.
    scheduleModuleDifferenceCheck(moduleKey, detail || 'Données modifiées');
  }
});

function installDirtyTracking(moduleInfo) {
  const { key, frame } = moduleInfo;
  if (!frame || frame.dataset.dirtyTrackingInstalled === '1') return;
  frame.dataset.dirtyTrackingInstalled = '1';

  const attach = () => {
    // Le portail ne surveille volontairement ni les clics, ni les champs,
    // ni localStorage. Chaque module signale lui-même uniquement ses vraies
    // opérations métier via BastComptaPortal.markChanged(...).
    getModuleSyncState(key);
    // Le rendu du module peut encore terminer quelques opérations synchrones :
    // on capture donc l’état de référence dès que son API est disponible.
    let attempts = 0;
    const capture = () => {
      attempts += 1;
      if (!captureModuleBaseline(key) && attempts < 40) setTimeout(capture, 100);
    };
    setTimeout(capture, 0);
    // Certains modules terminent ensuite un chargement Drive asynchrone.
    // On stabilise une seconde fois la référence, uniquement si l’utilisateur
    // n’a encore rien modifié entre-temps.
    setTimeout(() => {
      const state = getModuleSyncState(key);
      if (!state.dirty && !state.syncing) captureModuleBaseline(key);
    }, 2500);
    updateSyncStatusIndicator();
  };

  frame.addEventListener('load', attach);
  try {
    if ((frame.contentDocument || frame.contentWindow?.document)?.readyState === 'complete') attach();
  } catch { }
}

function waitForFrameLoad(frame, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!frame) return resolve(false);
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (doc && doc.readyState === 'complete' && frame.getAttribute('src') !== 'about:blank') return resolve(true);
    } catch { }

    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      frame.removeEventListener('load', onLoad);
      clearTimeout(timer);
      resolve(ok);
    };
    const onLoad = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    frame.addEventListener('load', onLoad, { once: true });
  });
}

async function waitForModuleSaveApi(frame, timeoutMs = 12000) {
  await waitForFrameLoad(frame, timeoutMs);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const saveApi = getFrameModuleSaveApi(frame);
    if (saveApi) return saveApi;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

async function saveSingleModuleFromPortal(moduleInfo) {
  const { key, label, frame } = moduleInfo;
  if (!frame) return { key, label, ok: false, message: 'iframe introuvable' };

  const saveFn = await waitForModuleSaveApi(frame);
  if (!saveFn) return { key, label, ok: false, message: 'fonction de sauvegarde indisponible' };

  const suppressedAlerts = [];
  let originalAlert = null;
  try {
    if (frame.contentWindow && typeof frame.contentWindow.alert === 'function') {
      originalAlert = frame.contentWindow.alert;
      frame.contentWindow.alert = message => {
        suppressedAlerts.push(String(message || ''));
        console.info('Alerte module interceptée pendant la sauvegarde globale:', label, message);
      };
    }
  } catch (error) {
    console.warn('Impossible d’intercepter les alertes du module :', label, error);
  }

  try {
    const hasModuleApi = typeof frame?.contentWindow?.BastComptaModule?.save === 'function';
    const result = hasModuleApi ? await saveFn({ silent: true, source: 'portal' }) : await saveFn(false);
    if (result === false || result?.ok === false) {
      return { key, label, ok: false, message: result?.message || suppressedAlerts.join(' | ') || 'échec signalé par le module', result, suppressedAlerts };
    }
    return { key, label, ok: true, result, suppressedAlerts };
  } catch (error) {
    console.error('Sauvegarde module impossible :', label, error);
    return { key, label, ok: false, message: error?.message || 'erreur inconnue', suppressedAlerts };
  } finally {
    if (originalAlert) {
      try { frame.contentWindow.alert = originalAlert; } catch { }
    }
  }
}

function formatModuleSaveLine(item) {
  const result = item.result || {};
  if (!item.ok) return `✖ ${item.label} : ERREUR — ${item.message || 'erreur inconnue'}`;
  const details = [];
  if (result.local) details.push('local OK');
  if (typeof result.drive === 'boolean') details.push(result.drive ? 'Drive OK' : 'Drive non utilisé / non connecté');
  if (result.chantierLinked || result.chantierSynced) details.push('suivi/chantiers OK');
  if (typeof result.exportedDocumentsCount === 'number') details.push(`${result.exportedDocumentsCount} document(s) Drive`);
  else if (Array.isArray(result.exportedDocuments)) details.push(`${result.exportedDocuments.length} document(s) Drive`);
  if (Array.isArray(result.warnings) && result.warnings.length) details.push(`avertissement(s): ${result.warnings.join(' ; ')}`);
  return `✔ ${item.label} : ${details.length ? details.join(', ') : 'OK'}`;
}

function showPortalSaveToast(text, state = 'working', autoHideMs = 0) {
  let toast = document.getElementById('portalSaveToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'portalSaveToast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    Object.assign(toast.style, {
      position: 'fixed', right: '22px', bottom: '22px', zIndex: '10000', minWidth: '260px', maxWidth: '420px',
      padding: '13px 16px', borderRadius: '12px', color: '#fff', fontWeight: '700',
      boxShadow: '0 10px 30px rgba(0,0,0,.24)', transition: 'opacity .2s ease', pointerEvents: 'none'
    });
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.background = state === 'success' ? '#256b2f' : state === 'error' ? '#a61b1b' : '#273142';
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  if (autoHideMs) toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, autoHideMs);
}

async function saveAllModulesFromPortal() {
  if (portalSyncInProgress) return false;
  const previousLabel = globalSaveBtn?.textContent || '💾';
  const loadedModules = getLoadedModuleFrames();
  loadedModules.forEach(installDirtyTracking);
  const modules = loadedModules.filter(item => {
    const state = getModuleSyncState(item.key);
    return state.dirty || !!state.error || !state.syncedOnce;
  });

  if (!modules.length) {
    showPortalSaveToast('✓ Tout est déjà synchronisé', 'success', 2200);
    updateSyncStatusIndicator();
    return true;
  }

  portalSyncInProgress = true;
  modules.forEach(item => {
    const state = getModuleSyncState(item.key);
    state.syncing = true;
    state.error = '';
  });
  if (globalSaveBtn) {
    globalSaveBtn.disabled = true;
    globalSaveBtn.textContent = '⏳';
  }
  updateSyncStatusIndicator();
  showPortalSaveToast(`Synchronisation de ${modules.length} module${modules.length > 1 ? 's' : ''}…`);
  backupStatus('Synchronisation des modules modifiés…', 'warning');

  try {
    const results = await Promise.all(modules.map(saveSingleModuleFromPortal));
    for (const item of results) {
      const state = getModuleSyncState(item.key);
      state.syncing = false;
      if (item.ok) {
        state.dirty = false;
        state.syncedOnce = true;
        state.error = '';
        state.changes = [];
        // La version qui vient d’être confirmée devient la nouvelle référence.
        captureModuleBaseline(item.key);
      } else {
        state.dirty = true;
        state.error = item.message || 'Erreur de sauvegarde';
      }
    }

    const failed = results.filter(item => !item.ok);
    if (failed.length) {
      const lines = results.map(formatModuleSaveLine).join('\n');
      showPortalSaveToast(`Synchronisation incomplète : ${failed.length} erreur(s)`, 'error', 6500);
      backupStatus('Synchronisation incomplète.', 'error');
      alert('La synchronisation n’est pas totalement confirmée.\n\n' + lines);
      return false;
    }

    showPortalSaveToast(`✓ ${modules.length} module${modules.length > 1 ? 's' : ''} synchronisé${modules.length > 1 ? 's' : ''}`, 'success', 3200);
    backupStatus('Toutes les modifications sont synchronisées.', 'success');
    return true;
  } catch (error) {
    modules.forEach(item => {
      const state = getModuleSyncState(item.key);
      state.syncing = false;
      state.dirty = true;
      state.error = error?.message || 'Erreur inconnue';
    });
    console.error('Sauvegarde globale impossible.', error);
    showPortalSaveToast('Synchronisation impossible', 'error', 6500);
    backupStatus('Erreur pendant la synchronisation.', 'error');
    alert('La sauvegarde globale a échoué : ' + (error?.message || 'erreur inconnue'));
    return false;
  } finally {
    portalSyncInProgress = false;
    if (globalSaveBtn) {
      globalSaveBtn.disabled = false;
      globalSaveBtn.textContent = previousLabel;
    }
    updateSyncStatusIndicator();
  }
}

// Mise en place du suivi pour les modules chargés maintenant ou plus tard.
[
  { key: 'devis-facture', label: 'Devis & Facture', frame: devisFrame },
  { key: 'tarifs', label: 'Tarifs', frame: tarifsFrame },
  { key: 'comptabilite', label: 'Comptabilité', frame: comptaFrame },
  { key: 'suivi-client', label: 'Suivi client', frame: chantierFrame },
  { key: 'impots', label: 'Impôts IPP', frame: impotsFrame }
].filter(item => item.frame).forEach(installDirtyTracking);

function showModificationDetails() {
  let modal = document.getElementById('syncChangesModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'syncChangesModal';
    modal.innerHTML = `
      <div class="sync-changes-backdrop"></div>
      <div class="sync-changes-dialog" role="dialog" aria-modal="true" aria-labelledby="syncChangesTitle">
        <div class="sync-changes-header">
          <h3 id="syncChangesTitle">Modifications non sauvegardées</h3>
          <button type="button" class="sync-changes-close" aria-label="Fermer">×</button>
        </div>
        <div class="sync-changes-body"></div>
        <div class="sync-changes-actions">
          <button type="button" class="sync-changes-cancel">Fermer</button>
          <button type="button" class="sync-changes-save">Sauvegarder maintenant</button>
        </div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #syncChangesModal{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center}
      #syncChangesModal[hidden]{display:none}
      .sync-changes-backdrop{position:absolute;inset:0;background:rgba(13,22,32,.52)}
      .sync-changes-dialog{position:relative;width:min(620px,calc(100vw - 32px));max-height:80vh;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden}
      .sync-changes-header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #e4e9ef}
      .sync-changes-header h3{margin:0;font-size:20px}
      .sync-changes-close{border:0;background:transparent;font-size:28px;cursor:pointer;line-height:1}
      .sync-changes-body{padding:16px 20px;overflow:auto;max-height:52vh}
      .sync-change-module{margin-bottom:16px}
      .sync-change-module h4{margin:0 0 7px;font-size:15px}
      .sync-change-module ul{margin:0;padding-left:20px;color:#3c4754}
      .sync-change-module li{margin:5px 0}
      .sync-changes-empty{color:#66717d;margin:0}
      .sync-changes-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e4e9ef;background:#f7f9fb}
      .sync-changes-actions button{border-radius:9px;padding:10px 15px;font-weight:700;cursor:pointer}
      .sync-changes-cancel{border:1px solid #cbd4dd;background:#fff}
      .sync-changes-save{border:1px solid #255c2b;background:#2f6f36;color:#fff}
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);
    const close = () => { modal.hidden = true; };
    modal.querySelector('.sync-changes-backdrop').addEventListener('click', close);
    modal.querySelector('.sync-changes-close').addEventListener('click', close);
    modal.querySelector('.sync-changes-cancel').addEventListener('click', close);
    modal.querySelector('.sync-changes-save').addEventListener('click', async () => {
      close();
      await saveAllModulesFromPortal();
    });
  }

  const body = modal.querySelector('.sync-changes-body');
  const dirtyModules = getLoadedModuleFrames().filter(item => getModuleSyncState(item.key).dirty);
  if (!dirtyModules.length) {
    body.innerHTML = '<p class="sync-changes-empty">Aucune modification en attente. La sauvegarde peut être vérifiée avec la disquette.</p>';
  } else {
    body.innerHTML = dirtyModules.map(item => {
      const state = getModuleSyncState(item.key);
      const entries = (state.changes || []).length ? state.changes : [{ text: 'Données du module modifiées' }];
      return `<section class="sync-change-module"><h4>${item.label}</h4><ul>${entries.map(entry => `<li>${String(entry.text).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}</li>`).join('')}</ul></section>`;
    }).join('');
  }
  modal.hidden = false;
}

syncStatusPill?.addEventListener('click', () => {
  if (!portalSyncInProgress) showModificationDetails();
});

window.addEventListener('beforeunload', event => {
  const hasUnsynced = portalSyncInProgress || getLoadedModuleFrames().some(item => {
    const state = getModuleSyncState(item.key);
    return state.dirty || !!state.error;
  });
  if (!hasUnsynced) return;
  event.preventDefault();
  event.returnValue = '';
});

updateSyncStatusIndicator();

async function sendInvoiceToAccounting() {
  const getRows = getFrameApi(devisFrame, 'getInvoiceAccountingRowsForComptabilite');
  const importRows = getFrameApi(comptaFrame, 'importInvoiceSalesRowsFromPortal');

  if (!getRows || !importRows) {
    alert('Les modules Devis/Facture et Comptabilité ne sont pas encore prêts.');
    return;
  }

  const payload = getRows() || {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const action = payload.action || 'upsert';

  if (action !== 'cancel' && !rows.length) {
    alert(payload.message || 'Aucune ligne de facture valide à envoyer en comptabilité.');
    return;
  }

  const invoiceNumber = payload.invoiceNumber || 'sans numéro';
  const docType = payload.documentType === 'credit_note'
    ? 'note de crédit'
    : (action === 'cancel' ? 'annulation de facture' : 'facture');

  let confirmText = '';
  if (action === 'cancel') {
    confirmText = 'Traiter l’annulation de la facture ' + invoiceNumber + ' en comptabilité ?\n\nLes lignes existantes avec ce numéro seront retirées, sauf si la période TVA est clôturée.';
  } else {
    const totalTvac = rows.reduce((sum, row) => sum + (Number(row.tvac) || 0), 0);
    const totalText = totalTvac.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' });
    confirmText = 'Envoyer la ' + docType + ' ' + invoiceNumber + ' en comptabilité ?\n\n' + rows.length + ' ligne(s) de vente seront créée(s) ou remplacée(s).\nTotal TVAC : ' + totalText;
  }

  if (!confirm(confirmText)) return;

  let result;
  try {
    result = await importRows(payload);
  } catch (error) {
    console.error(error);
    alert('Erreur lors de l’envoi vers la comptabilité.');
    return;
  }

  if (result && result.ok === false) {
    alert(result.message || 'Envoi refusé par la comptabilité.');
    return;
  }

  switchMainTab('compta');

  const openSales = getFrameApi(comptaFrame, 'goToPage');
  if (openSales) openSales('sales');

  setTimeout(() => resizeIframeToContent(comptaFrame), 100);
  alert(result?.message || 'Document envoyé en comptabilité.');
}

window.sendInvoiceToAccounting = sendInvoiceToAccounting;
window.BastComptaPortal = Object.assign(window.BastComptaPortal || {}, { sendInvoiceToAccounting });

async function openInvoicePrintPreviewFromAccounting(invoiceNumber, invoiceFileId = '') {
  switchMainTab('devis');

  await new Promise(resolve => setTimeout(resolve, 150));

  const openPreview = getFrameApi(devisFrame, 'openInvoicePreviewByNumberFromDrive');
  if (!openPreview) {
    alert('Le module Devis & Facture n’est pas encore prêt.');
    return false;
  }

  return await openPreview(invoiceNumber, invoiceFileId);
}

window.openInvoicePrintPreviewFromAccounting = openInvoicePrintPreviewFromAccounting;


const BAST_BACKUP_VERSION = 5;
const LOCAL_DEVIS_KEY = 'devis-facture-style-vrai-document';
const LOCAL_COMPTA_KEY = 'comptabilite-local-v1';
const LOCAL_CHANTIERS_KEY = 'bastcompta-chantiers-v1';
const LOCAL_IMPOTS_KEY = 'bastcompta-impots-belgique-v1';
const LOCAL_TARIFS_KEY = 'bastcompta_tarifs_v7_vierge_sans_fiche';
const LOCAL_TARIFS_CATEGORIES_KEY = 'bastcompta_tarifs_categories_v3_vierge_sans_fiche';

function backupStatus(text, type = '') {
  setMessage(text || '', type);
  if (backupOverlayText && backupOverlay?.classList.contains('active') && text) {
    backupOverlayText.textContent = text;
  }
}

function showBlockingProgress(title, text) {
  if (backupOverlayTitle) backupOverlayTitle.textContent = title || 'Traitement en cours';
  if (backupOverlayText) backupOverlayText.textContent = text || 'Veuillez patienter…';
  if (backupOverlay) backupOverlay.classList.add('active');
}

function hideBlockingProgress() {
  if (backupOverlay) backupOverlay.classList.remove('active');
}

function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function sanitizePathPart(value, fallback = 'Sans nom') {
  return String(value || fallback)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || fallback;
}



const HIDDEN_DRIVE_CATEGORIES = [
  { key: 'all', label: 'Tous' },
  { key: 'devis', label: 'Devis' },
  { key: 'factures', label: 'Factures' },
  { key: 'rappels', label: 'Rappels' },
  { key: 'comptabilite', label: 'Comptabilité' },
  { key: 'clients', label: 'Clients / chantiers' },
  { key: 'impots', label: 'Impôts' },
  { key: 'sauvegardes', label: 'Sauvegardes' },
  { key: 'autres', label: 'Autres' }
];

function detectHiddenDriveCategory(file = {}) {
  const name = normalizeSearchText(file.name || '');
  const mime = normalizeSearchText(file.mimeType || '');

  if (name.endsWith(' zip') || name.includes(' sauvegarde ') || name.includes(' backup ') || mime.includes(' zip')) return 'sauvegardes';
  if (name.startsWith('devis ') || name.includes(' devis ') || name.includes(' quote ')) return 'devis';
  if (name.startsWith('facture ') || name.includes(' facture ') || name.includes(' invoice ')) return 'factures';
  if (name.startsWith('rappel ') || name.includes(' rappel ') || name.includes(' reminder ')) return 'rappels';
  if (name.includes('comptabilite') || name.includes(' compta ') || name.includes(' achat ') || name.includes(' achats ') || name.includes(' vente ') || name.includes(' ventes ') || name.includes(' frais ')) return 'comptabilite';
  if (name.includes('suivi client') || name.includes('suivi-client') || name.includes(' chantier ') || name.includes(' chantiers ') || name.includes(' client ') || name.includes(' crm ')) return 'clients';
  if (name.includes('impot') || name.includes('impots') || name.includes(' ipp ') || name.includes(' fiscal ') || name.includes(' taxe ') || name.includes(' taxes ')) return 'impots';
  if (name.includes('tarif') || name.includes('prix') || name.includes('poste')) return 'autres';
  return 'autres';
}

function getHiddenDriveCategoryLabel(categoryKey) {
  return HIDDEN_DRIVE_CATEGORIES.find(category => category.key === categoryKey)?.label || 'Autres';
}

function hiddenDriveCategoryCounts(files = []) {
  const counts = Object.fromEntries(HIDDEN_DRIVE_CATEGORIES.map(category => [category.key, 0]));
  counts.all = files.length;
  files.forEach(file => {
    const category = detectHiddenDriveCategory(file);
    counts[category] = (counts[category] || 0) + 1;
  });
  return counts;
}

function updateHiddenDriveTabs(files = []) {
  if (!hiddenDriveTabs) return;
  const counts = hiddenDriveCategoryCounts(files);
  hiddenDriveTabs.querySelectorAll('[data-drive-category]').forEach(button => {
    const category = button.dataset.driveCategory || 'all';
    button.classList.toggle('active', category === hiddenDriveActiveCategory);
    const label = getHiddenDriveCategoryLabel(category);
    const count = counts[category] || 0;
    button.innerHTML = '<span>' + escapeHtml(label) + '</span><strong>' + count + '</strong>';
  });
}

function filteredHiddenDriveFiles() {
  if (hiddenDriveActiveCategory === 'all') return hiddenDriveFilesCache;
  return hiddenDriveFilesCache.filter(file => detectHiddenDriveCategory(file) === hiddenDriveActiveCategory);
}

function renderHiddenDriveList() {
  if (!hiddenDriveStatus || !hiddenDriveList) return;
  updateHiddenDriveTabs(hiddenDriveFilesCache);

  const files = filteredHiddenDriveFiles();
  const categoryLabel = getHiddenDriveCategoryLabel(hiddenDriveActiveCategory);

  if (!hiddenDriveFilesCache.length) {
    hiddenDriveStatus.textContent = 'Aucun fichier caché trouvé dans appDataFolder.';
    hiddenDriveList.innerHTML = '';
    return;
  }

  if (!files.length) {
    hiddenDriveStatus.textContent = 'Aucun fichier dans l’onglet « ' + categoryLabel + ' ». Total Drive caché : ' + hiddenDriveFilesCache.length + ' fichier(s).';
    hiddenDriveList.innerHTML = '<div class="hidden-drive-empty">Aucun fichier dans cette catégorie.</div>';
    return;
  }

  hiddenDriveStatus.textContent = files.length + ' fichier(s) affiché(s) dans « ' + categoryLabel + ' » · Total Drive caché : ' + hiddenDriveFilesCache.length + '.';
  hiddenDriveList.innerHTML = files.map(file => {
    const name = escapeHtml(file.name || 'Sans nom');
    const category = detectHiddenDriveCategory(file);
    const categoryLabel = escapeHtml(getHiddenDriveCategoryLabel(category));
    const meta = [
      file.mimeType || '',
      file.size ? (Math.round(Number(file.size) / 1024) + ' Ko') : '',
      file.modifiedTime ? ('modifié le ' + new Date(file.modifiedTime).toLocaleString('fr-BE')) : ''
    ].filter(Boolean).map(escapeHtml).join(' · ');

    return '<div class="hidden-drive-item" data-drive-file-category="' + category + '">'
      + '<div><div class="hidden-drive-name">' + name + '</div><div class="hidden-drive-meta"><span class="hidden-drive-category-badge">' + categoryLabel + '</span>' + (meta ? '<span>' + meta + '</span>' : '') + '</div></div>'
      + '<div class="hidden-drive-actions">'
      + (isLikelyPreviewableDriveDocument(file) ? '<button class="small primary" type="button" data-preview-drive-file="' + escapeHtml(file.id) + '">Aperçu PDF</button>' : '')
      + '<button class="small" type="button" data-download-drive-file="' + escapeHtml(file.id) + '">Télécharger</button>'
      + '<button class="small danger" type="button" data-delete-drive-file="' + escapeHtml(file.id) + '" data-drive-file-name="' + name + '">Supprimer</button>'
      + '</div>'
      + '</div>';
  }).join('');

  bindHiddenDriveFileButtons();
}

function bindHiddenDriveFileButtons() {
  if (!hiddenDriveList) return;

  hiddenDriveList.querySelectorAll('[data-preview-drive-file]').forEach(button => {
    button.addEventListener('click', async () => {
      const file = hiddenDriveFilesCache.find(item => item.id === button.dataset.previewDriveFile);
      if (!file) return;
      await previewHiddenDriveDocumentPdf(file, button);
    });
  });

  hiddenDriveList.querySelectorAll('[data-download-drive-file]').forEach(button => {
    button.addEventListener('click', async () => {
      const file = hiddenDriveFilesCache.find(item => item.id === button.dataset.downloadDriveFile);
      if (!file) return;
      try {
        button.disabled = true;
        button.textContent = 'Téléchargement…';
        const blob = await downloadDriveFileBlob(file);
        downloadBlob(blob, file.name || 'fichier-drive-cache');
      } catch (error) {
        console.error(error);
        alert('Impossible de télécharger ce fichier Drive caché.');
      } finally {
        button.disabled = false;
        button.textContent = 'Télécharger';
      }
    });
  });

  hiddenDriveList.querySelectorAll('[data-delete-drive-file]').forEach(button => {
    button.addEventListener('click', async () => {
      const file = hiddenDriveFilesCache.find(item => item.id === button.dataset.deleteDriveFile);
      if (!file) return;
      const label = file.name || 'ce fichier';
      const confirmed = confirm('Supprimer définitivement du Drive caché : "' + label + '" ?\n\nCette action ne peut pas être annulée. Pense à télécharger une sauvegarde avant de supprimer.');
      if (!confirmed) return;

      try {
        button.disabled = true;
        button.textContent = 'Suppression…';
        await deleteHiddenDriveFile(file);
        hiddenDriveStatus.textContent = 'Fichier supprimé : ' + label;
        await refreshHiddenDriveList();
      } catch (error) {
        console.error(error);
        alert('Impossible de supprimer ce fichier Drive caché. Vérifie la connexion Google Drive puis réessaie.');
      } finally {
        button.disabled = false;
        button.textContent = 'Supprimer';
      }
    });
  });
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameIdentityKey(value) {
  const tokens = normalizeSearchText(value).split(' ').filter(Boolean);
  if (!tokens.length) return '';
  return 'name:' + tokens.sort().join('|');
}

function clientKeys(client = {}) {
  const keys = [];
  const number = normalizeSearchText(client.clientNumber || client.number || '');
  const email = normalizeSearchText(client.email || client.clientEmail || '');

  let vat = normalizeSearchText(client.vat || client.clientVat || '');
  if (['na', 'n a', 'non applicable', 'aucun', 'sans tva'].includes(vat)) {
    vat = '';
  }

  const name = nameIdentityKey(client.name || client.clientName || client.client || '');
  if (number) keys.push('number:' + number);
  if (email) keys.push('email:' + email);
  if (vat) keys.push('vat:' + vat);
  if (name) keys.push(name);
  return keys;
}

function buildClientRegistry(...clientLists) {
  const byKey = new Map();
  const clients = [];
  const remember = (client = {}) => {
    const name = String(client.name || client.clientName || '').trim();
    const keys = clientKeys(client);
    if (!name || !keys.length) return null;

    let existing = null;
    for (const key of keys) {
      if (byKey.has(key)) {
        existing = byKey.get(key);
        break;
      }
    }

    if (!existing) {
      existing = {
        ...client,
        name,
        canonicalName: name,
        id: client.id || '',
        email: client.email || client.clientEmail || '',
        clientNumber: client.clientNumber || '',
        vat: client.vat || client.clientVat || '',
        address: client.address || ''
      };
      clients.push(existing);
    } else {
      existing.email = existing.email || client.email || client.clientEmail || '';
      existing.clientNumber = existing.clientNumber || client.clientNumber || '';
      existing.vat = existing.vat || client.vat || client.clientVat || '';
      existing.address = existing.address || client.address || '';
      existing.id = existing.id || client.id || '';
    }

    for (const key of keys) byKey.set(key, existing);
    return existing;
  };

  clientLists.flat().filter(Boolean).forEach(remember);
  return { byKey, clients, remember };
}

function resolveClientForDocument(doc = {}, registry) {
  const candidates = [
    { id: doc.clientId || '', name: doc.clientName || '', email: doc.clientEmail || '', clientNumber: doc.clientNumber || '', vat: doc.clientVat || '', address: doc.address || '' },
    { name: doc.clientName || doc.client || '', email: doc.clientEmail || '', clientNumber: doc.clientNumber || '', vat: doc.clientVat || '' }
  ];

  for (const candidate of candidates) {
    for (const key of clientKeys(candidate)) {
      if (registry?.byKey?.has(key)) return registry.byKey.get(key);
    }
  }

  const fallbackName = String(doc.clientName || doc.client || '').trim();
  if (fallbackName && registry) return registry.remember({ name: fallbackName, email: doc.clientEmail || '', clientNumber: doc.clientNumber || '', vat: doc.clientVat || '', address: doc.address || '' });
  return null;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getLocalBackupData() {
  return {
    devisFacture: safeJsonParse(localStorage.getItem(LOCAL_DEVIS_KEY), {}),
    comptabilite: safeJsonParse(localStorage.getItem(LOCAL_COMPTA_KEY), {}),
    chantiers: safeJsonParse(localStorage.getItem(LOCAL_CHANTIERS_KEY), { version: 1, projects: [] }),
    impots: safeJsonParse(localStorage.getItem(LOCAL_IMPOTS_KEY), {}),
    tarifs: safeJsonParse(localStorage.getItem(LOCAL_TARIFS_KEY), []),
    tarifsCategories: safeJsonParse(localStorage.getItem(LOCAL_TARIFS_CATEGORIES_KEY), [])
  };
}

function detectDocumentInfo(fileName, parsed, registry) {
  const lower = String(fileName || '').toLowerCase();
  let docKey = '', folder = 'Autres', label = 'document';
  if (lower.startsWith('devis-')) { docKey = 'quote'; folder = 'Devis'; label = 'devis'; }
  else if (lower.startsWith('facture-')) { docKey = 'invoice'; folder = 'Factures'; label = 'facture'; }
  else if (lower.startsWith('rappel-')) { docKey = 'reminder'; folder = 'Rappels'; label = 'rappel'; }
  else if (lower.startsWith('comptabilite-') || lower.includes('comptabilite')) { folder = 'Comptabilite/Donnees'; label = 'comptabilite'; }
  else if (lower.includes('suivi-client') || lower.includes('suivi client') || lower.includes('chantier') || lower.includes('chantiers')) { folder = 'Suivi-client/Donnees'; label = 'suivi-client'; }

  const doc = docKey && parsed ? (parsed[docKey] || {}) : {};
  if (docKey && doc.clientId && Array.isArray(parsed?.clients)) {
    const found = parsed.clients.find(client => String(client.id || '') === String(doc.clientId || ''));
    if (found && registry) registry.remember(found);
  }

  const resolvedClient = docKey ? resolveClientForDocument(doc, registry) : null;
  const clientName = sanitizePathPart(resolvedClient?.canonicalName || resolvedClient?.name || doc.clientName || 'Sans client');
  const rawNumber = doc.documentNumber || String(fileName || '').replace(/\.json$/i, '');
  return { docKey, folder, label, clientName, documentNumber: sanitizePathPart(rawNumber, 'sans-numero'), doc, resolvedClient };
}

function euro(value) {
  return Number(value || 0).toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' });
}

function makeComptaReportPdfBlob(comptaData) {
  if (!window.jspdf?.jsPDF) return null;
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const d = comptaData || {};
  const sum = (arr, key) => (Array.isArray(arr) ? arr : []).reduce((s, row) => s + Number(row?.[key] || 0), 0);
  const salesHt = sum(d.sales, 'htva'), purchasesHt = sum(d.purchases, 'htva');
  const vatSales = sum(d.sales, 'vat'), vatPurchases = sum(d.purchases, 'vat');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.text('Rapport comptable BastCompta', 14, 18);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.text('Période : ' + String(d.company?.period || new Date().getFullYear()), 14, 28);
  let y = 42;
  [['Ventes HTVA', salesHt], ['Achats HTVA', purchasesHt], ['TVA ventes', vatSales], ['TVA achats', vatPurchases], ['TVA nette', vatSales - vatPurchases], ['Résultat estimé', salesHt - purchasesHt]].forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold'); pdf.text(label, 14, y);
    pdf.setFont('helvetica', 'normal'); pdf.text(euro(value), 80, y);
    y += 8;
  });
  return pdf.output('blob');
}

async function waitForFrameReady(frame, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (frame?.contentWindow && frame.contentDocument?.readyState === 'complete') return true;
    } catch { }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  return false;
}

async function makeRenderedDocumentPdfBlob(parsed, docKey) {
  if (!window.html2canvas || !window.jspdf?.jsPDF) return null;

  // Important : html2canvas ne capture pas correctement une iframe cachée.
  // Comme la sauvegarde se lance depuis l’onglet Sauvegarde, on affiche temporairement
  // l’onglet Devis & Facture avant de capturer le document PDF.
  const previousTab = document.querySelector(".main-tab.active")?.dataset.mainTab || "backup";
  if (previousTab !== "devis") {
    switchMainTab("devis");
    await new Promise(resolve => setTimeout(resolve, 450));
  }

  await waitForFrameReady(devisFrame);
  const prepare = getFrameApi(devisFrame, "prepareBastComptaDocumentForBackupPdf");
  const restore = getFrameApi(devisFrame, "restoreBastComptaAfterBackupPdf");
  if (!prepare) {
    if (previousTab !== "devis") switchMainTab(previousTab);
    return null;
  }

  try {
    await prepare(parsed, docKey);
    await new Promise(resolve => setTimeout(resolve, 350));

    const doc = devisFrame.contentDocument;
    const body = doc?.body;
    if (body) body.classList.add("backup-pdf-capture");

    const page = doc?.querySelector(".page[data-page=\"" + docKey + "\"].active") || doc?.querySelector(".page.active");
    const sheet = page?.querySelector(".sheet");
    if (!sheet) return null;

    sheet.scrollIntoView({ block: "start", inline: "nearest" });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await window.html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: Math.max(sheet.scrollWidth, 1100),
      windowHeight: Math.max(sheet.scrollHeight, 1500)
    });

    const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = canvas.height * imgWidth / canvas.width;

    if (imgHeight <= pageHeight - margin * 2) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      const pageCanvas = document.createElement('canvas');
      const ctx = pageCanvas.getContext('2d');
      const sliceHeight = Math.floor((pageHeight - margin * 2) * canvas.width / imgWidth);
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      let y = 0;
      let pageIndex = 0;
      while (y < canvas.height) {
        const currentSliceHeight = Math.min(sliceHeight, canvas.height - y);
        pageCanvas.height = currentSliceHeight;
        ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, y, canvas.width, currentSliceHeight, 0, 0, canvas.width, currentSliceHeight);
        if (pageIndex > 0) pdf.addPage();
        const h = currentSliceHeight * imgWidth / canvas.width;
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.96), 'JPEG', margin, margin, imgWidth, h);
        y += currentSliceHeight;
        pageIndex += 1;
      }
    }

    return pdf.output('blob');
  } finally {
    try {
      const doc = devisFrame.contentDocument;
      doc?.body?.classList.remove("backup-pdf-capture");
      if (restore) await restore();
    } catch (error) {
      console.warn("Restauration après capture PDF impossible.", error);
    }
    if (previousTab !== "devis") switchMainTab(previousTab);
  }
}

function isRenderableBusinessDocument(file, parsed = null) {
  const name = String(file?.name || '').toLowerCase();
  if (!name.endsWith('.json')) return false;
  if (name.startsWith('devis-') || name.startsWith('facture-') || name.startsWith('rappel-')) return true;
  return !!(parsed?.quote || parsed?.invoice || parsed?.reminder);
}

async function makePdfForDriveJsonFile(file, parsed) {
  const name = String(file?.name || '').toLowerCase();

  if (name.startsWith('facture-')) {
    return makeRenderedDocumentPdfBlob(parsed, 'invoice');
  }

  if (name.startsWith('devis-')) {
    return makeRenderedDocumentPdfBlob(parsed, 'quote');
  }

  if (name.startsWith('rappel-')) {
    return makeRenderedDocumentPdfBlob(parsed, 'reminder');
  }

  if (parsed?.invoice?.documentNumber) {
    return makeRenderedDocumentPdfBlob(parsed, 'invoice');
  }

  if (parsed?.quote?.documentNumber) {
    return makeRenderedDocumentPdfBlob(parsed, 'quote');
  }

  if (parsed?.reminder?.documentNumber) {
    return makeRenderedDocumentPdfBlob(parsed, 'reminder');
  }

  if (name.includes('comptabilite')) {
    return makeComptaReportPdfBlob(parsed);
  }

  return null;
}

async function ensureBackupLibraries() {
  if (!window.JSZip || !window.jspdf?.jsPDF || !window.html2canvas) {
    throw new Error('Bibliothèques de sauvegarde incomplètes. Vérifie JSZip, jsPDF et html2canvas dans index.html.');
  }
}

async function driveRequest(path, options = {}) {
  const token = await ensureGoogleAccessToken(false);
  const res = await fetch('https://www.googleapis.com/drive/v3/' + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error('Drive API error ' + res.status);
  return res;
}

async function listDriveAppDataFiles() {
  const files = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime)',
      pageSize: '100',
      orderBy: 'modifiedTime desc'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await driveRequest('files?' + params.toString());
    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return files;
}

async function downloadDriveFileBlob(file) {
  const token = await ensureGoogleAccessToken(false);
  const res = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Téléchargement Drive impossible: ' + res.status);
  return await res.blob();
}

async function readDriveJsonFile(file) {
  const blob = await downloadDriveFileBlob(file);
  const text = await blob.text();
  return JSON.parse(text);
}

window.BastComptaDrive = {
  listDriveAppDataFiles,
  readDriveJsonFile
};

async function deleteHiddenDriveFile(file) {
  const token = await ensureGoogleAccessToken(false);
  const res = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id), {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok && res.status !== 204) throw new Error('Suppression Drive impossible: ' + res.status);
  return true;
}

function isLikelyPreviewableDriveDocument(file) {
  const name = String(file?.name || '').toLowerCase();
  return name.endsWith('.json') && (name.startsWith('devis-') || name.startsWith('facture-') || name.startsWith('rappel-') || name.includes('comptabilite'));
}

async function previewHiddenDriveDocumentPdf(file, button = null) {
  const previousText = button?.textContent;
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Aperçu…';
    }

    const parsed = await readDriveJsonFile(file);
    const pdfBlob = await makePdfForDriveJsonFile(file, parsed);
    if (!pdfBlob) {
      alert('Aperçu PDF indisponible pour ce fichier.');
      return;
    }

    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error(error);
    alert('Impossible de générer l’aperçu PDF depuis ce fichier Drive caché.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText || 'Aperçu PDF';
    }
  }
}

async function openHiddenDriveModal() {
  settingsMenu?.classList.remove('open');
  hiddenDriveModal?.classList.add('open');
  hiddenDriveModal?.setAttribute('aria-hidden', 'false');
  await refreshHiddenDriveList();
}

function closeHiddenDriveModal() {
  hiddenDriveModal?.classList.remove('open');
  hiddenDriveModal?.setAttribute('aria-hidden', 'true');
}

async function refreshHiddenDriveList() {
  if (!hiddenDriveStatus || !hiddenDriveList) return;
  hiddenDriveStatus.textContent = 'Chargement des fichiers Drive cachés…';
  hiddenDriveList.innerHTML = '';

  try {
    // Ici on force une demande interactive si le token Google n'est plus frais.
    // Sans ça, le bouton peut indiquer Drive connecté via Firestore/localStorage,
    // mais l'accès à appDataFolder échoue parce que le token OAuth en mémoire est expiré.
    await ensureGoogleAccessToken(true);

    hiddenDriveFilesCache = await listDriveAppDataFiles();
    renderHiddenDriveList();
  } catch (error) {
    console.error(error);
    hiddenDriveStatus.textContent =
      'Impossible de charger les fichiers cachés Drive. Reconnecte Google Drive puis réessaie. Détail : ' +
      (error?.message || error);
  }
}

function backupZipPathForDriveFile(file, parsed = null, registry = null) {
  const name = sanitizePathPart(file.name || 'fichier-drive');
  const lower = name.toLowerCase();
  if (lower.endsWith('.json') && parsed) {
    const info = detectDocumentInfo(name, parsed, registry);
    if (info.docKey) return 'Clients/' + info.clientName + '/' + info.folder + '/' + name;
    if (info.label === 'comptabilite') return 'Comptabilite/Donnees/' + name;
    if (info.label === 'suivi-client' || info.label === 'chantier') return 'Suivi-client/Donnees/' + name;
  }
  if (lower.endsWith('.pdf')) {
    if (lower.includes('achat') || lower.includes('fournisseur')) return 'Comptabilite/Achats-PDF/' + name;
    if (lower.startsWith('devis-')) return 'Clients/Sans client/Devis/' + name;
    if (lower.startsWith('facture-')) return 'Clients/Sans client/Factures/' + name;
    if (lower.startsWith('rappel-')) return 'Clients/Sans client/Rappels/' + name;
  }
  return 'Google-Drive-AppData/' + name;
}

async function addApplicationSourceFiles(zip) {
  for (const fileName of ['index.html', 'devis-facture.html', 'comptabilite.html', 'suivi-client.html']) {
    try {
      const res = await fetch(fileName, { cache: 'no-store' });
      if (res.ok) zip.file('Application/' + fileName, await res.text());
    } catch (error) {
      console.warn('Impossible d’ajouter le fichier application :', fileName, error);
    }
  }
}

async function createFullBackupZip() {
  await ensureBackupLibraries();
  await waitForFrameReady(devisFrame);
  await waitForFrameReady(comptaFrame);
  await waitForFrameReady(chantierFrame);
  await waitForFrameReady(impotsFrame);

  const zip = new JSZip();
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const localData = getLocalBackupData();
  const localDevis = localData.devisFacture || {};
  const localCompta = localData.comptabilite || {};
  const localChantiers = localData.chantiers || { version: 1, projects: [] };
  const localImpots = localData.impots || {};
  const localTarifs = Array.isArray(localData.tarifs) ? localData.tarifs : [];
  const localTarifsCategories = Array.isArray(localData.tarifsCategories) ? localData.tarifsCategories : [];
  const registry = buildClientRegistry(Array.isArray(localDevis.clients) ? localDevis.clients : []);
  const driveFilesManifest = [];

  const currentUser = auth.currentUser;

  if (!currentUser?.uid) {
    throw new Error('Utilisateur non connecté. Impossible de créer une sauvegarde liée au compte.');
  }

  const manifest = {
    app: 'BastCompta',
    version: BAST_BACKUP_VERSION,
    createdAt: now.toISOString(),
    owner: {
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: currentUser.displayName || ''
    },
    backupType: 'complete-local-drive-pdf-crm-suivi-client-faithful',
    modules: ['devis-facture', 'comptabilite', 'suivi-client', 'impots', 'tarifs'],
    restore: { localStorage: true, googleDrive: true, pdfFiles: true, clients: true, crm: true, mode: 'complete-reconstruction' },
    restoreHints: { localStorage: { devisFacture: LOCAL_DEVIS_KEY, comptabilite: LOCAL_COMPTA_KEY, suiviClient: LOCAL_CHANTIERS_KEY, chantiers: LOCAL_CHANTIERS_KEY, impots: LOCAL_IMPOTS_KEY, tarifs: LOCAL_TARIFS_KEY, tarifsCategories: LOCAL_TARIFS_CATEGORIES_KEY }, driveSpace: 'appDataFolder', conflictPolicy: 'replace-existing-by-name-after-confirmation' },
    crm: { clients: [], count: 0, exports: [] },
    clients: [],
    files: []
  };

  const addFile = (path, category, meta = {}) => manifest.files.push({ path, category, ...meta });
  const addClientDoc = (info, type, jsonPath = '', pdfPath = '', source = 'local') => {
    const clientName = sanitizePathPart(info?.clientName || 'Sans client');
    let client = manifest.clients.find(item => item.name === clientName);
    if (!client) { client = { name: clientName, documents: [] }; manifest.clients.push(client); }
    client.documents.push({ type, documentNumber: info?.documentNumber || '', json: jsonPath, pdf: pdfPath, source });
  };

  backupStatus('Préparation de la sauvegarde complète fidèle…', 'warning');
  zip.file('01-donnees-locales/devis-facture-local.json', JSON.stringify(localDevis, null, 2));
  zip.file('01-donnees-locales/comptabilite-local.json', JSON.stringify(localCompta, null, 2));
  zip.file('01-donnees-locales/suivi-client-local.json', JSON.stringify(localChantiers, null, 2));
  zip.file('01-donnees-locales/impots-ipp-local.json', JSON.stringify(localImpots, null, 2));
  zip.file('01-donnees-locales/tarifs-local.json', JSON.stringify({ categories: localTarifsCategories, tarifs: localTarifs }, null, 2));
  addFile('01-donnees-locales/devis-facture-local.json', 'localStorage', { module: 'devis-facture' });
  addFile('01-donnees-locales/comptabilite-local.json', 'localStorage', { module: 'comptabilite' });
  addFile('01-donnees-locales/suivi-client-local.json', 'localStorage', { module: 'suivi-client' });
  addFile('01-donnees-locales/impots-ipp-local.json', 'localStorage', { module: 'impots' });
  addFile('01-donnees-locales/tarifs-local.json', 'localStorage', { module: 'tarifs' });

  const crmClients = registry.clients;
  manifest.crm.clients = crmClients.map(client => ({ id: client.id || '', name: client.canonicalName || client.name || '', email: client.email || '', phone: client.phone || '', vat: client.vat || client.clientVat || '', address: client.address || '', clientNumber: client.clientNumber || '' }));
  manifest.crm.count = crmClients.length;

  const crmJsonPath = 'CRM/clients-complet.json';
  zip.file(crmJsonPath, JSON.stringify(manifest.crm.clients, null, 2));
  addFile(crmJsonPath, 'crm-json', { module: 'devis-facture', clientCount: crmClients.length });
  manifest.crm.exports.push(crmJsonPath);

  const crmCsvPath = 'CRM/clients.csv';
  const csvRows = [['Nom', 'Email', 'Téléphone', 'TVA', 'N° client', 'Adresse']].concat(manifest.crm.clients.map(c => [c.name, c.email, c.phone, c.vat, c.clientNumber, c.address]));
  zip.file(crmCsvPath, csvRows.map(row => row.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(';')).join('\n'));
  addFile(crmCsvPath, 'crm-csv', { module: 'devis-facture', clientCount: crmClients.length });
  manifest.crm.exports.push(crmCsvPath);

  for (const client of crmClients) {
    const clientName = sanitizePathPart(client.canonicalName || client.name || 'Sans client');
    const ficheJsonPath = 'Clients/' + clientName + '/00-CRM/fiche-client.json';
    const ficheTxtPath = 'Clients/' + clientName + '/00-CRM/fiche-client.txt';
    zip.file(ficheJsonPath, JSON.stringify(client, null, 2));
    zip.file(ficheTxtPath, ['Client : ' + (client.canonicalName || client.name || ''), 'N° client : ' + (client.clientNumber || ''), 'Email : ' + (client.email || ''), 'Téléphone : ' + (client.phone || ''), 'TVA : ' + (client.vat || client.clientVat || ''), 'Adresse : ' + (client.address || ''), 'Notes : ' + (client.notes || '')].join('\n'));
    addFile(ficheJsonPath, 'crm-client-json', { module: 'devis-facture', client: clientName });
    addFile(ficheTxtPath, 'crm-client-fiche', { module: 'devis-facture', client: clientName });
    let manifestClient = manifest.clients.find(item => item.name === clientName);
    if (!manifestClient) { manifestClient = { name: clientName, crm: ficheJsonPath, documents: [] }; manifest.clients.push(manifestClient); }
  }

  const docCollections = [
    { key: 'quotes', type: 'devis', docKey: 'quote', folder: 'Devis' },
    { key: 'invoices', type: 'facture', docKey: 'invoice', folder: 'Factures' },
    { key: 'reminders', type: 'rappel', docKey: 'reminder', folder: 'Rappels' }
  ];

  for (const collection of docCollections) {
    const list = Array.isArray(localDevis[collection.key]) ? localDevis[collection.key] : [];
    for (const doc of list) {
      const resolvedClient = resolveClientForDocument(doc, registry);
      const clientName = sanitizePathPart(resolvedClient?.canonicalName || resolvedClient?.name || doc.clientName || 'Sans client');
      const number = sanitizePathPart(doc.documentNumber || doc.id || collection.type, 'sans-numero');
      const path = 'Clients/' + clientName + '/' + collection.folder + '/' + collection.type + '-' + number + '.json';
      const wrapped = { [collection.docKey]: doc, clients: localDevis.clients || [] };
      zip.file(path, JSON.stringify(wrapped, null, 2));
      addFile(path, collection.type + '-json', { module: 'devis-facture', client: clientName, documentNumber: number });

      let pdfPath = '';
      const pdfBlob = await makeRenderedDocumentPdfBlob(wrapped, collection.docKey);
      if (pdfBlob) {
        pdfPath = 'Clients/' + clientName + '/' + collection.folder + '/' + collection.type + '-' + number + '.pdf';
        zip.file(pdfPath, pdfBlob);
        addFile(pdfPath, collection.type + '-pdf', { module: 'devis-facture', client: clientName, documentNumber: number });
      }

      addClientDoc({ clientName, documentNumber: number }, collection.type, path, pdfPath, 'localStorage');
    }
  }

  const comptaPdf = makeComptaReportPdfBlob(localCompta);
  if (comptaPdf) {
    zip.file('Comptabilite/Rapport-comptable.pdf', comptaPdf);
    addFile('Comptabilite/Rapport-comptable.pdf', 'compta-pdf', { module: 'comptabilite' });
  }

  if (isTokenFresh() || wasDrivePreviouslyConnected()) {
    try {
      backupStatus('Ajout des fichiers Google Drive cachés…', 'warning');
      await ensureGoogleAccessToken(false);
      const driveFiles = await listDriveAppDataFiles();
      for (const file of driveFiles) {
        let parsed = null;
        let blob = null;
        try {
          blob = await downloadDriveFileBlob(file);
          if (String(file.name || '').toLowerCase().endsWith('.json')) parsed = JSON.parse(await blob.text());
          if (!blob) blob = await downloadDriveFileBlob(file);
        } catch (error) {
          console.warn('Fichier Drive ignoré :', file.name, error);
          continue;
        }

        const zipPath = backupZipPathForDriveFile(file, parsed, registry);
        zip.file(zipPath, blob);
        addFile(zipPath, 'googleDriveAppData', { module: 'drive', name: file.name, id: file.id });
        driveFilesManifest.push({ id: file.id, name: file.name, path: zipPath, mimeType: file.mimeType, modifiedTime: file.modifiedTime });

        if (parsed && isRenderableBusinessDocument(file, parsed)) {
          const info = detectDocumentInfo(file.name, parsed, registry);
          const pdfBlob = await makePdfForDriveJsonFile(file, parsed);
          if (pdfBlob) {
            const pdfPath = zipPath.replace(/\.json$/i, '.pdf').replace('/Donnees/', '/PDF/');
            zip.file(pdfPath, pdfBlob);
            addFile(pdfPath, 'pdf-fidele-drive', { module: 'drive', name: file.name, client: info.clientName, documentNumber: info.documentNumber });
            addClientDoc(info, info.label, zipPath, pdfPath, 'googleDriveAppData');
          } else if (info.docKey) {
            addClientDoc(info, info.label, zipPath, '', 'googleDriveAppData');
          }
        }
      }
    } catch (error) {
      console.warn('Sauvegarde Drive ignorée :', error);
      manifest.driveWarning = error?.message || 'Drive indisponible';
    }
  }

  manifest.driveFiles = driveFilesManifest;
  manifest.clients.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  manifest.files.sort((a, b) => a.path.localeCompare(b.path, 'fr'));
  zip.file('manifest-bastcompta.json', JSON.stringify(manifest, null, 2));

  await addApplicationSourceFiles(zip);

  backupStatus('Création du fichier ZIP…', 'warning');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(blob, 'Sauvegarde-BastCompta-complete-' + stamp + '.zip');
  return true;
}

async function handleFullBackupClick() {
  showBlockingProgress('Sauvegarde complète', 'Préparation des données…');
  try {
    await saveAllModulesFromPortal();
    await createFullBackupZip();
    backupStatus('Sauvegarde ZIP complète créée.', 'success');
  } catch (error) {
    console.error(error);
    alert('Impossible de créer la sauvegarde complète : ' + (error?.message || 'erreur inconnue'));
    backupStatus('Erreur sauvegarde complète.', 'error');
  } finally {
    hideBlockingProgress();
  }
}

function handleFullRestoreClick() {
  settingsMenu?.classList.remove('open');
  fullRestoreInput?.click();
}

async function handleFullRestoreFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  const confirmed = confirm('Restaurer cette sauvegarde complète ?\n\nLes données locales actuelles seront remplacées. Si la sauvegarde contient des fichiers Drive, ils pourront être renvoyés vers le Drive caché après confirmation.');
  if (!confirmed) return;

  showBlockingProgress('Restauration complète', 'Lecture du fichier ZIP…');
  try {
    await ensureBackupLibraries();
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest-bastcompta.json');
    const manifest = manifestFile ? JSON.parse(await manifestFile.async('string')) : null;

    const currentUser = auth.currentUser;

    if (!currentUser?.uid) {
      throw new Error('Utilisateur non connecté. Impossible de restaurer cette sauvegarde.');
    }

    if (!manifest?.owner?.uid) {
      throw new Error(
        'Cette sauvegarde ne contient pas d’identifiant de propriétaire. ' +
        'Par sécurité, elle ne peut pas être restaurée automatiquement.'
      );
    }

    if (manifest.owner.uid !== currentUser.uid) {
      throw new Error(
        'Cette sauvegarde appartient à un autre compte BastCompta. ' +
        'Restauration bloquée pour éviter le partage ou la réutilisation d’un compte d’essai.'
      );
    }

    const readJsonFromZip = async (path, fallback) => {
      const item = zip.file(path);
      if (!item) return fallback;
      return JSON.parse(await item.async('string'));
    };

    const devisData = await readJsonFromZip('01-donnees-locales/devis-facture-local.json', null);
    const comptaData = await readJsonFromZip('01-donnees-locales/comptabilite-local.json', null);
    const suiviData = await readJsonFromZip('01-donnees-locales/suivi-client-local.json', null);
    const impotsData = await readJsonFromZip('01-donnees-locales/impots-ipp-local.json', null);
    const tarifsData = await readJsonFromZip('01-donnees-locales/tarifs-local.json', null);

    if (devisData) localStorage.setItem(LOCAL_DEVIS_KEY, JSON.stringify(devisData));
    if (comptaData) localStorage.setItem(LOCAL_COMPTA_KEY, JSON.stringify(comptaData));
    if (suiviData) localStorage.setItem(LOCAL_CHANTIERS_KEY, JSON.stringify(suiviData));
    if (impotsData) localStorage.setItem(LOCAL_IMPOTS_KEY, JSON.stringify(impotsData));
    if (tarifsData) {
      if (Array.isArray(tarifsData.tarifs)) localStorage.setItem(LOCAL_TARIFS_KEY, JSON.stringify(tarifsData.tarifs));
      if (Array.isArray(tarifsData.categories)) localStorage.setItem(LOCAL_TARIFS_CATEGORIES_KEY, JSON.stringify(tarifsData.categories));
    }

    const driveFiles = [];
    if (manifest?.files) {
      for (const entry of manifest.files) {
        if (entry.category === 'googleDriveAppData' && entry.path && zip.file(entry.path)) driveFiles.push(entry);
      }
    }

    if (driveFiles.length && confirm(driveFiles.length + ' fichier(s) Drive caché(s) sont présents dans la sauvegarde. Les renvoyer vers Google Drive appDataFolder ?')) {
      await ensureGoogleAccessToken(false);
      for (const entry of driveFiles) {
        const zipItem = zip.file(entry.path);
        const blob = await zipItem.async('blob');
        const fileName = entry.name || entry.path.split('/').pop();

        await deleteDriveAppDataFilesByName(fileName);
        await uploadBlobToDriveAppData(blob, fileName, 'application/json');
      }
    }

    alert('Restauration terminée. La page va être rechargée.');
    location.reload();
  } catch (error) {
    console.error(error);
    alert('Impossible de restaurer la sauvegarde : ' + (error?.message || 'erreur inconnue'));
  } finally {
    hideBlockingProgress();
  }
}

async function deleteDriveAppDataFilesByName(name) {
  const allFiles = await listDriveAppDataFiles();
  const matches = allFiles.filter(file => file.name === name);

  for (const file of matches) {
    await deleteHiddenDriveFile(file);
  }

  return matches.length;
}

async function uploadBlobToDriveAppData(blob, name, mimeType = 'application/json') {
  const token = await ensureGoogleAccessToken(false);
  const metadata = { name, parents: ['appDataFolder'] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, name);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form
  });
  if (!res.ok) throw new Error('Upload Drive impossible: ' + res.status);
  return await res.json();
}

async function waitForGoogleApi(timeoutMs = 10000) {
  const startedAt = Date.now();
  while ((!window.gapi || !window.google?.accounts?.oauth2) && Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!window.gapi || !window.google?.accounts?.oauth2) {
    throw new Error('Bibliothèques Google non chargées.');
  }
}

async function initGoogleDrive() {
  try {
    await waitForGoogleApi();
    await new Promise((resolve, reject) => {
      gapi.load('client', {
        callback: resolve,
        onerror: reject
      });
    });
    await gapi.client.init({
      apiKey: GOOGLE_API_KEY,
      discoveryDocs: [DRIVE_DISCOVERY_DOC]
    });

    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPES,
      prompt: '',
      callback: async tokenResponse => {
        googleRequestInFlight = null;

        try {
          if (tokenResponse?.access_token) {
            googleAccessToken = tokenResponse.access_token;
            googleTokenExpiresAt = Date.now() + (Number(tokenResponse.expires_in || 3600) * 1000);

            await validateDriveAccountForCurrentUser(googleAccessToken);

            gapi.client.setToken({ access_token: googleAccessToken });
            markDriveConnected();
            updateDriveButtons();
            broadcastDriveConnected();
          }
        } catch (error) {
          console.error(error);
          disconnectGoogleDrive(true);
          setMessage(error.message || 'Compte Google Drive refusé.', 'error');
        }
      },
      error_callback: error => {
        googleRequestInFlight = null;
        console.warn('Google token refusé.', error);
        updateDriveButtons();
      }
    });

    googleDriveReady = true;
    updateDriveButtons();
  } catch (error) {
    console.error(error);
    googleDriveReady = false;
    updateDriveButtons();
    setMessage('Google Drive indisponible pour le moment. La connexion au portail reste possible.', 'warning');
  }
}

async function ensureGoogleAccessToken(interactive = true) {
  if (isTokenFresh()) return googleAccessToken;
  if (!googleTokenClient) throw new Error('Google Drive n’est pas initialisé.');
  if (googleRequestInFlight) return googleRequestInFlight;

  googleRequestInFlight = new Promise((resolve, reject) => {
    const previousCallback = googleTokenClient.callback;
    googleTokenClient.callback = tokenResponse => {
      googleTokenClient.callback = previousCallback;
      googleRequestInFlight = null;

      if (tokenResponse?.access_token) {

        googleAccessToken = tokenResponse.access_token;

        googleTokenExpiresAt =
          Date.now() + (Number(tokenResponse.expires_in || 3600) * 1000);

        validateDriveAccountForCurrentUser(googleAccessToken)

          .then(() => {

            gapi.client.setToken({
              access_token: googleAccessToken
            });

            markDriveConnected();

            updateDriveButtons();

            broadcastDriveConnected();

            resolve(googleAccessToken);

          })

          .catch(error => {

            console.error(error);

            disconnectGoogleDrive(true);

            updateDriveButtons();

            reject(error);

          });

      } else {

        updateDriveButtons();

        reject(new Error('Autorisation Google Drive refusée.'));

      }
    };

    try {
      googleTokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (error) {
      googleTokenClient.callback = previousCallback;
      googleRequestInFlight = null;
      reject(error);
    }
  });

  return googleRequestInFlight;
}

async function connectGoogleDrive() {
  try {
    await ensureGoogleAccessToken(true);
    setMessage('Google Drive connecté.', 'success');
  } catch (error) {
    console.error(error);
    setMessage('Connexion Google Drive refusée ou impossible.', 'error');
  }
}

async function maybeRestoreDriveConnection() {
  if (silentReconnectAttempted || isTokenFresh() || !googleTokenClient || !wasDrivePreviouslyConnected()) return;
  silentReconnectAttempted = true;
  try {
    await ensureGoogleAccessToken(false);
  } catch (error) {
    console.warn('Reconnexion silencieuse Drive impossible.', error);
    updateDriveButtons();
  }
}

function disconnectGoogleDrive(clearRemembered = true) {
  if (googleAccessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(googleAccessToken); } catch (error) { console.warn(error); }
  }
  googleAccessToken = null;
  googleTokenExpiresAt = 0;
  googleRequestInFlight = null;
  if (window.gapi?.client) gapi.client.setToken(null);
  if (clearRemembered) clearDriveConnectionFlag();
  updateDriveButtons();
  broadcastDriveDisconnected();
}

function broadcastDriveConnected() {
  const payload = {
    type: 'BASTCOMPTA_GOOGLE_TOKEN',
    accessToken: googleAccessToken,
    expiresAt: googleTokenExpiresAt
  };

  [devisFrame, terrainFrame, comptaFrame, chantierFrame, impotsFrame, tarifsFrame].forEach(frame => {
    postToFrame(frame, payload);
  });
}

function broadcastDriveDisconnected() {
  const payload = {
    type: 'BASTCOMPTA_GOOGLE_LOGOUT'
  };

  [devisFrame, terrainFrame, comptaFrame, chantierFrame, impotsFrame, tarifsFrame].forEach(frame => {
    postToFrame(frame, payload);
  });
}

function bindIframeMessaging() {
  [devisFrame, terrainFrame, comptaFrame, chantierFrame, tarifsFrame].forEach(frame => {
    frame?.addEventListener('load', () => {
      if (isTokenFresh()) broadcastDriveConnected();
      else broadcastDriveDisconnected();
    });
  });
}

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  if (
    event.data?.type === 'BASTCOMPTA_DRIVE_REQUEST_TOKEN' ||
    event.data?.type === 'BASTCOMPTA_REFRESH_TOKEN' ||
    event.data?.type === 'BASTCOMPTA_DRIVE_STATUS_REQUEST'
  ) {
    ensureGoogleAccessToken(true)
      .then(() => broadcastDriveConnected())
      .catch(() => broadcastDriveDisconnected());
  }
  if (event.data?.type === 'BASTCOMPTA_DRIVE_DISCONNECT') {
    disconnectGoogleDrive(true);
  }
  if (event.data?.type === 'BASTCOMPTA_SEND_INVOICE_TO_ACCOUNTING') {
    if (!currentSubscriptionState?.access?.accounting) {
      showSubscriptionModal(currentSubscriptionState);
    } else {
      sendInvoiceToAccounting();
    }
  }
  if (event.data?.type === 'BASTCOMPTA_OPEN_SUBSCRIPTION') {
    showSubscriptionModal(currentSubscriptionState);
  }

  if (event.data?.type === 'BASTCOMPTA_TARIF_ADDED_TO_DOCUMENT') {
    postToFrame(devisFrame, event.data);
    openDevisDocumentFromSuiviClient(event.data.docKey === 'invoice' ? 'invoice' : 'quote');
  }

  if (event.data?.type === 'BASTCOMPTA_OPEN_DEVIS_DOCUMENT') {
    openDevisDocumentFromSuiviClient(event.data.docKey || event.data.pageKey || 'invoice');
  }
});

async function openDevisDocumentFromSuiviClient(docKey = 'invoice') {

  const pageKey = ['quote', 'invoice', 'reminder'].includes(docKey)
    ? docKey
    : 'invoice';

  switchMainTab('devis');

  const targetSrc = devisFrame?.dataset?.src || '';

  if (
    devisFrame &&
    targetSrc &&
    (!devisFrame.getAttribute('src') ||
      devisFrame.getAttribute('src') === 'about:blank')
  ) {
    devisFrame.setAttribute('src', targetSrc);
  }

  await waitForFrameLoad(devisFrame, 8000);

  await new Promise(resolve => setTimeout(resolve, 120));

  const setPageApi =
    getFrameApi(devisFrame, 'goToPage') ||
    getFrameApi(devisFrame, 'setActivePage');

  if (setPageApi) {
    try {
      setPageApi(pageKey);
    } catch (error) {
      console.warn('Ouverture document impossible.', error);
    }
  } else {
    postToFrame(devisFrame, {
      type: 'BASTCOMPTA_SET_ACTIVE_PAGE',
      pageKey
    });
  }

  requestAnimationFrame(() => {
    resizeIframeToContent(devisFrame);
  });

  return true;
}

window.openDevisDocumentFromSuiviClient = openDevisDocumentFromSuiviClient;

async function createUserDocument(user) {
  if (!user?.uid) return null;

  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    return snap.data();
  }

  const now = new Date();
  const isOwner = (user.email || '').toLowerCase() === 'seb-n@hotmail.com';

  const userData = {
    email: user.email || '',
    pseudo: getUserPseudo(user),
    displayName: user.displayName || '',
    createdAt: now.toISOString(),

    // Par défaut, un nouveau compte reste en statut gratuit.
    // L’essai de 30 jours ne démarre que lorsque l’utilisateur clique sur
    // le bouton "Activer l’essai gratuit 30 jours".
    subscriptionStatus: isOwner ? 'owner' : 'free',
    subscriptionActive: isOwner,
    subscriptionSchemaVersion: 2,
    subscriptions: {},
    subscriptionModules: [],
    entitlements: {},

    trialUsed: false,
    trialStartedAt: null,
    trialEndsAt: null,

    role: isOwner ? 'admin' : 'user',
    plan: isOwner ? 'owner' : 'free',

    monthlyPrice: isOwner ? 0 : 4.99,
    currency: 'EUR',

    stripeCustomerId: null,
    stripeSubscriptionId: null,

    updatedAt: now.toISOString()
  };

  await setDoc(userRef, userData);
  return userData;
}

async function checkSubscription(user) {
  if (!user?.uid) return { allowed: false, reason: 'not_connected', status: 'free', access: { accounting: false, client: false, premium: false } };

  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return { allowed: false, reason: 'no_user_document', status: 'free', access: { accounting: false, client: false, premium: false } };

  const data = snap.data() || {};
  const now = new Date();
  let status = data.subscriptionStatus || 'free';

  if (status === 'trial' && data.subscriptionActive === true) {
    const trialEnd = parseDate(data.trialEndsAt);
    if (!trialEnd || now > trialEnd) {
      status = 'expired';
      await updateDoc(userRef, { subscriptionStatus: 'expired', subscriptionActive: false, updatedAt: now.toISOString() }).catch(() => {});
    }
  }

  if (status === 'active' && data.subscriptionActive === true) {
    const legacyEnd = parseDate(data.subscriptionEndsAt);
    if (!legacyEnd || now > legacyEnd) {
      status = 'expired';
      await updateDoc(userRef, { subscriptionStatus: 'expired', subscriptionActive: false, updatedAt: now.toISOString() }).catch(() => {});
    }
  }

  const access = getAccessMap(data, status);
  const allowed = access.accounting || access.client || access.premium;
  return { allowed, status, access, reason: allowed ? 'active' : status, data };
}


async function activateTrial() {
  const user = auth.currentUser;
  if (!user?.uid) return;

  const data = currentSubscriptionState?.data || {};
  if (data.trialUsed === true) {
    alert('L’essai gratuit a déjà été utilisé sur ce compte.');
    return;
  }

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(now.getDate() + 30);

  const userRef = doc(db, 'users', user.uid);
  const update = {
    subscriptionStatus: 'trial',
    subscriptionActive: true,
    trialUsed: true,
    trialStartedAt: now.toISOString(),
    trialEndsAt: trialEnd.toISOString(),
    plan: 'trial',
    updatedAt: now.toISOString()
  };

  try {
    if (activateTrialBtn) {
      activateTrialBtn.disabled = true;
      activateTrialBtn.textContent = 'Activation...';
    }

    await updateDoc(userRef, update);

    const fresh = await checkSubscription(user);
    currentSubscriptionState = fresh;
    updateCurrentUserDisplay(user, fresh);
    loadProtectedFrames(fresh);
    switchMainTab('devis');
    showSubscriptionModal(fresh);
  } catch (error) {
    console.error('Impossible d’activer l’essai gratuit.', error);
    alert('Impossible d’activer l’essai gratuit. Vérifie ta connexion puis réessaie.');
    if (activateTrialBtn) {
      activateTrialBtn.disabled = false;
      activateTrialBtn.textContent = 'Activer l’essai gratuit 30 jours';
    }
  }
}

function subscriptionEuro(value) {
  return `${Number(value).toFixed(2).replace('.', ',')} €`;
}

function periodLabel(period) {
  return period === 'yearly' ? 'Annuel' : period === 'quarterly' ? 'Trimestriel' : 'Mensuel';
}

function subscriptionMessageFromResult(result) {
  if (result?.reason === 'trial_expired') return 'Votre essai est terminé. Les fonctions gratuites restent disponibles et vous pouvez choisir un pack ci-dessous.';
  if (result?.reason === 'subscription_expired' || result?.reason === 'expired') return 'Votre abonnement est expiré. Choisissez la formule à renouveler ci-dessous.';
  return 'Choisissez uniquement le pack dont vous avez besoin, ou Premium pour tout débloquer.';
}

async function selectSubscriptionOffer(pack, period) {
  const user = auth.currentUser;
  if (!user?.uid || !SUBSCRIPTION_PRICES[pack]?.[period]) return;
  const price = SUBSCRIPTION_PRICES[pack][period];
  const code = `${SUBSCRIPTION_PACKS[pack].code}-${period === 'yearly' ? 'AN' : period === 'quarterly' ? 'TRI' : 'MOIS'}`;
  const email = currentSubscriptionState?.data?.email || user.email || '';
  const communication = `bastcompta ${email} ${code}`.trim();

  try {
    await updateDoc(doc(db, 'users', user.uid), {
      subscriptionRequest: {
        pack,
        period,
        price,
        currency: 'EUR',
        status: 'pending_payment',
        communication,
        requestedAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    });
    subscriptionCommunication.textContent = communication;
    document.querySelectorAll('[data-subscription-choice]').forEach(btn => btn.classList.toggle('selected', btn.dataset.subscriptionChoice === `${pack}:${period}`));
    const notice = document.getElementById('subscriptionChoiceNotice');
    if (notice) notice.textContent = `${SUBSCRIPTION_PACKS[pack].label} · ${periodLabel(period)} · ${subscriptionEuro(price)} sélectionné. Effectuez le virement avec la communication indiquée.`;
  } catch (error) {
    console.error('Enregistrement du choix impossible.', error);
    alert('Impossible d’enregistrer votre choix dans Firebase. Vérifiez votre connexion puis réessayez.');
  }
}

function renderPlanCard(pack, title, description, features) {
  const prices = SUBSCRIPTION_PRICES[pack];
  return `
    <article class="subscription-pack-card ${pack === 'premium' ? 'featured' : ''}">
      ${pack === 'premium' ? '<span class="subscription-best-badge">Meilleur rapport qualité/prix</span>' : ''}
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(description)}</p>
      <ul>${features.map(item => `<li>✓ ${escapeHtml(item)}</li>`).join('')}</ul>
      <div class="subscription-period-buttons">
        <button type="button" data-subscription-choice="${pack}:monthly" data-pack="${pack}" data-period="monthly"><strong>${subscriptionEuro(prices.monthly)}</strong><small>/ mois</small></button>
        <button type="button" data-subscription-choice="${pack}:quarterly" data-pack="${pack}" data-period="quarterly"><strong>${subscriptionEuro(prices.quarterly)}</strong><small>/ trimestre</small></button>
        <button type="button" data-subscription-choice="${pack}:yearly" data-pack="${pack}" data-period="yearly"><strong>${subscriptionEuro(prices.yearly)}</strong><small>/ an</small></button>
      </div>
    </article>`;
}

function showSubscriptionModal(result = currentSubscriptionState) {
  const user = auth.currentUser;
  const data = result?.data || currentSubscriptionState?.data || {};
  const email = data.email || user?.email || '';
  if (!subscriptionModal) return;

  ensureSubscriptionModalStyles();
  const label = statusLabel(result);
  const canActivateTrial = result?.status !== 'owner' && result?.status !== 'trial' && data.trialUsed !== true && !result?.allowed;
  const accessText = result?.access?.premium
    ? 'Tous les modules sont accessibles.'
    : [result?.access?.accounting ? 'Comptabilité + IPP' : '', result?.access?.client ? 'Suivi client' : ''].filter(Boolean).join(' · ') || 'Devis, factures, tarifs, Mode Terrain et Google Drive restent gratuits.';

  subscriptionModalTitle.textContent = `Abonnements de ${getUserPseudo(user, data)}`;
  subscriptionModalText.innerHTML = `
    <div class="subscription-status-box"><strong>Statut : ${escapeHtml(label)}</strong><span>${escapeHtml(accessText)}</span></div>
    <p class="subscription-info-text"><strong>Le socle BastCompta reste gratuit.</strong><br>Ajoutez seulement le pack nécessaire. Le Pack Comptabilité comprend aussi l’IPP et Peppol. Premium débloque tout.</p>
    <div class="subscription-pack-grid">
      ${renderPlanCard('accounting', 'Pack Comptabilité', 'Pour la gestion comptable et fiscale.', ['Comptabilité complète', 'TVA', 'IPP', 'Peppol / Doccle', 'Résultats et investissements'])}
      ${renderPlanCard('client', 'Pack Suivi client', 'Pour organiser les clients et les chantiers.', ['Fiches et historique client', 'Notes et rappels', 'Chantiers', 'Suivi commercial'])}
      ${renderPlanCard('premium', 'Premium complet', 'Tous les modules dans une seule formule.', ['Pack Comptabilité', 'Pack Suivi client', 'Toutes les futures fonctions Premium'])}
    </div>
    <div id="subscriptionChoiceNotice" class="subscription-choice-notice">Sélectionnez une formule pour générer la communication de paiement et enregistrer votre demande dans Firebase.</div>
    <div class="trial-activation-box">
      <h3>Essai gratuit de 30 jours</h3>
      <p>L’essai débloque tous les packs pendant 30 jours.</p>
      <button id="activateTrialBtn" type="button" ${canActivateTrial ? '' : 'disabled'}>${canActivateTrial ? 'Activer l’essai gratuit' : (data.trialUsed ? 'Essai déjà utilisé' : 'Essai indisponible')}</button>
    </div>`;

  activateTrialBtn = document.getElementById('activateTrialBtn');
  activateTrialBtn?.addEventListener('click', activateTrial);
  subscriptionModalText.querySelectorAll('[data-pack][data-period]').forEach(button => {
    button.addEventListener('click', () => selectSubscriptionOffer(button.dataset.pack, button.dataset.period));
  });

  const requested = data.subscriptionRequest;
  subscriptionCommunication.textContent = requested?.communication || (email ? `bastcompta ${email}` : 'bastcompta');
  subscriptionModal.classList.add('open');
  subscriptionModal.setAttribute('aria-hidden', 'false');
}

currentUserEl?.addEventListener('click', () => showSubscriptionModal(currentSubscriptionState));

closeSubscriptionModalBtn?.addEventListener('click', () => {
  subscriptionModal?.classList.remove('open');
  subscriptionModal?.setAttribute('aria-hidden', 'true');
});

authTabs.forEach(btn => {
  btn.addEventListener('click', () => switchAuthTab(btn.dataset.authTab));
});

mainTabs.forEach(btn => {
  btn.addEventListener('click', () => switchMainTab(btn.dataset.mainTab));
});

settingsMenuBtn?.addEventListener('click', event => {
  event.stopPropagation();
  settingsMenu?.classList.toggle('open');
});

document.addEventListener('click', event => {
  if (settingsMenu && !settingsMenu.contains(event.target)) settingsMenu.classList.remove('open');
});

globalSaveBtn?.addEventListener('click', saveAllModulesFromPortal);
hiddenDriveBtn?.addEventListener('click', openHiddenDriveModal);
closeHiddenDriveBtn?.addEventListener('click', closeHiddenDriveModal);
refreshHiddenDriveBtn?.addEventListener('click', refreshHiddenDriveList);

hiddenDriveTabs?.addEventListener('click', event => {
  const button = event.target.closest('[data-drive-category]');
  if (!button) return;
  hiddenDriveActiveCategory = button.dataset.driveCategory || 'all';
  renderHiddenDriveList();
});
hiddenDriveModal?.addEventListener('click', event => {
  if (event.target === hiddenDriveModal) closeHiddenDriveModal();
});

connectDriveBtn?.addEventListener('click', async () => {

  settingsMenu?.classList.remove('open');

  alert(
    "BastCompta utilise un espace privé caché de votre Google Drive pour stocker les sauvegardes.\n\n" +
    "Google va demander une autorisation de stockage.\n\n" +
    "Cochez la case puis cliquez sur Continuer pour activer la sauvegarde Drive."
  );

  try {

    await connectGoogleDrive();

  } catch (error) {

    console.error(error);

  }

});
disconnectDriveBtn?.addEventListener('click', () => { settingsMenu?.classList.remove('open'); disconnectGoogleDrive(true); });
if (fullBackupBtn) fullBackupBtn.addEventListener('click', () => { settingsMenu?.classList.remove('open'); handleFullBackupClick(); });
if (fullRestoreBtn) fullRestoreBtn.addEventListener('click', () => { settingsMenu?.classList.remove('open'); handleFullRestoreClick(); });
if (fullRestoreInput) fullRestoreInput.addEventListener('change', handleFullRestoreFile);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Ne jamais bloquer l'installation des gestionnaires du formulaire de connexion.
// La persistance Firebase et Google Drive sont initialisés en arrière-plan.
setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn('Persistance Firebase indisponible.', error);
});
initGoogleDrive().catch(error => {
  console.warn('Initialisation Google Drive indisponible.', error);
});
bindIframeMessaging();

registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = normalizeEmail(document.getElementById('registerEmail').value);
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerPasswordConfirm').value;

  if (!email) {
    setMessage('Merci de saisir une adresse mail valide.', 'error');
    return;
  }

  if (password.length < 8) {
    setMessage('Le mot de passe doit contenir au moins 8 caractères.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    setMessage('Les mots de passe ne correspondent pas.', 'error');
    return;
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: email.split('@')[0] });
    await sendEmailVerification(credential.user);
    setMessage('Compte créé. Un email de vérification a été envoyé.', 'success');
  } catch (error) {
    setMessage(humanizeAuthError(error), 'error');
  }
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = normalizeEmail(document.getElementById('loginEmail').value);
  const password = document.getElementById('loginPassword').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setMessage('Connexion réussie.', 'success');
  } catch (error) {
    setMessage(humanizeAuthError(error), 'error');
  }
});

forgotPasswordBtn?.addEventListener('click', async () => {
  const email = normalizeEmail(document.getElementById('loginEmail').value);

  if (!email) {
    setMessage('Saisis ton adresse mail dans le champ de connexion pour recevoir le lien.', 'warning');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    setMessage('Email de réinitialisation envoyé.', 'success');
  } catch (error) {
    setMessage(humanizeAuthError(error), 'error');
  }
});

logoutBtn?.addEventListener('click', async () => {
  settingsMenu?.classList.remove('open');
  try {
    disconnectGoogleDrive(true);
    await signOut(auth);
  } catch (error) {
    setMessage(humanizeAuthError(error), 'error');
  }
});

sendVerificationBtn?.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await sendEmailVerification(user);
    currentUserEl.textContent = `Connecté : ${user.email} · email non vérifié`;
    setMessage('Email de vérification renvoyé.', 'success');
  } catch (error) {
    setMessage(humanizeAuthError(error), 'error');
  }
});

function configureModuleIframe(frame) {
  if (!frame) return;
  // L'iframe doit rester exactement à la hauteur de la zone visible.
  // C'est son propre document qui défile, pas une iframe artificiellement haute.
  frame.style.removeProperty('height');
  frame.style.height = '100%';
  frame.setAttribute('scrolling', 'yes');
}

[devisFrame, terrainFrame, comptaFrame, chantierFrame, impotsFrame].forEach((frame) => {
  configureModuleIframe(frame);
  frame?.addEventListener('load', () => configureModuleIframe(frame));
});

async function showTrialInfo(user) {
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) return;

    const data = snap.data();
    currentSubscriptionState = {
      allowed: Object.values(getAccessMap(data, data.subscriptionStatus || 'free')).some(Boolean),
      status: data.subscriptionStatus || 'free',
      access: getAccessMap(data, data.subscriptionStatus || 'free'),
      data
    };

    updateCurrentUserDisplay(user, currentSubscriptionState);
  } catch (error) {
    console.warn('Impossible d’afficher le statut utilisateur.', error);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    disconnectGoogleDrive(false);
    showAuth();
    return;
  }

  await user.reload().catch(() => { });
  const freshUser = auth.currentUser || user;

  if (typeof window.clarity === "function") {
    window.clarity(
      "identify",
      freshUser.uid,
      undefined,
      undefined,
      freshUser.email || freshUser.uid
    );
  }

  // La connexion Firebase Auth ne doit jamais être annulée ou masquée à cause
  // d'un problème temporaire de lecture du document d'abonnement Firestore.
  // Dans ce cas, l'utilisateur entre dans BastCompta avec les droits gratuits.
  const freeFallback = {
    allowed: false,
    status: 'free',
    access: { accounting: false, client: false, premium: false },
    reason: 'subscription_unavailable',
    data: {
      email: freshUser.email || '',
      pseudo: getUserPseudo(freshUser),
      subscriptionStatus: 'free',
      subscriptionActive: false
    }
  };

  try {
    await createUserDocument(freshUser);
  } catch (error) {
    console.warn('Document utilisateur Firebase indisponible, accès gratuit appliqué.', error);
  }

  let subscription = freeFallback;
  try {
    subscription = await checkSubscription(freshUser);
  } catch (error) {
    console.warn('Abonnement Firebase indisponible, accès gratuit appliqué.', error);
  }

  currentSubscriptionState = subscription;
  showPortal(freshUser, subscription);
  setMessage('');
});


/* ================================
   Centre d'aide BastCompta
   ================================ */

const openHelpBtn = document.getElementById('openHelpBtn');
const helpCenterModal = document.getElementById('helpCenterModal');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const helpTabs = Array.from(document.querySelectorAll('.help-tab'));
const helpPages = Array.from(document.querySelectorAll('.help-page'));
const helpSearchInput = document.getElementById('helpSearchInput');
const helpSearchCount = document.getElementById('helpSearchCount');
const helpCurrentTitle = document.getElementById('helpCurrentTitle');
const helpCurrentSubtitle = document.getElementById('helpCurrentSubtitle');

function normalizeHelpText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function openHelpCenter() {
  if (!helpCenterModal) return;
  settingsMenu?.classList.remove('open');
  helpCenterModal.classList.add('open');
  helpCenterModal.setAttribute('aria-hidden', 'false');
  if (helpSearchInput) helpSearchInput.focus();
}

function closeHelpCenter() {
  if (!helpCenterModal) return;
  helpCenterModal.classList.remove('open');
  helpCenterModal.setAttribute('aria-hidden', 'true');
}

function switchHelpTab(tabName) {
  const selectedPage = helpPages.find(page => page.dataset.helpPage === tabName);
  if (!selectedPage) return;

  helpTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.helpTab === tabName));
  helpPages.forEach(page => page.classList.toggle('active', page === selectedPage));

  if (helpCurrentTitle) helpCurrentTitle.textContent = selectedPage.dataset.title || 'Centre d’aide';
  if (helpCurrentSubtitle) helpCurrentSubtitle.textContent = selectedPage.dataset.subtitle || '';

  if (helpSearchInput && helpSearchInput.value) {
    helpSearchInput.value = '';
    filterHelpArticles();
  }
}

function filterHelpArticles() {
  if (!helpCenterModal) return;

  const query = normalizeHelpText(helpSearchInput?.value || '');
  const articles = Array.from(document.querySelectorAll('.help-article'));

  articles.forEach(article => {
    article.classList.remove('hidden-by-search');
  });
  helpPages.forEach(page => {
    page.classList.remove('hidden-by-search');
  });

  if (!query) {
    helpCenterModal.classList.remove('searching');
    if (helpSearchCount) helpSearchCount.textContent = '';
    return;
  }

  helpCenterModal.classList.add('searching');

  let matchCount = 0;

  helpPages.forEach(page => {
    const pageArticles = Array.from(page.querySelectorAll('.help-article'));
    let pageHasMatch = false;

    pageArticles.forEach(article => {
      const text = normalizeHelpText(article.innerText);
      const match = text.includes(query);
      article.classList.toggle('hidden-by-search', !match);
      if (match) {
        pageHasMatch = true;
        matchCount += 1;
      }
    });

    page.classList.toggle('hidden-by-search', !pageHasMatch);
  });

  helpTabs.forEach(tab => tab.classList.remove('active'));

  if (helpCurrentTitle) helpCurrentTitle.textContent = 'Résultats de recherche';
  if (helpCurrentSubtitle) helpCurrentSubtitle.textContent = matchCount ? 'Les rubriques contenant le mot recherché sont affichées.' : 'Aucun résultat trouvé.';
  if (helpSearchCount) helpSearchCount.textContent = matchCount ? matchCount + ' résultat(s)' : 'Aucun résultat';
}

openHelpBtn?.addEventListener('click', openHelpCenter);
closeHelpBtn?.addEventListener('click', closeHelpCenter);

helpCenterModal?.addEventListener('click', event => {
  if (event.target === helpCenterModal) closeHelpCenter();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && helpCenterModal?.classList.contains('open')) {
    closeHelpCenter();
  }
});

helpTabs.forEach(tab => {
  tab.addEventListener('click', () => switchHelpTab(tab.dataset.helpTab));
});

helpSearchInput?.addEventListener('input', filterHelpArticles);

/* ===== Navigation latérale BastCompta ===== */
(() => {
  const shell = document.querySelector('#portalScreen .portal-shell');
  const sidebar = document.getElementById('portalSidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const backdrop = document.getElementById('sidebarBackdrop');
  const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
  const moduleTitle = document.getElementById('topbarModuleTitle');
  const pageTitle = document.getElementById('topbarPageTitle');
  const navButtons = Array.from(document.querySelectorAll('#portalScreen .sidebar-nav [data-main-tab]'));
  const groups = Array.from(document.querySelectorAll('#portalScreen .sidebar-group'));

  const labels = {
    devis: 'Devis & Factures',
    compta: 'Comptabilité',
    chantier: 'Suivi client',
    terrain: 'Mode terrain',
    impots: 'Impôts IPP'
  };
  const defaults = { devis: 'quote', compta: 'sales', impots: 'summary' };
  const frames = { devis: devisFrame, terrain: terrainFrame, compta: comptaFrame, chantier: chantierFrame, impots: impotsFrame };

  function closeMobileSidebar() {
    shell?.classList.remove('sidebar-open');
    toggleBtn?.setAttribute('aria-expanded', 'false');
  }

  function openGroup(tabName) {
    groups.forEach(group => {
      const open = group.dataset.sidebarGroup === tabName;
      group.classList.toggle('open', open);
      group.querySelector('.sidebar-module')?.setAttribute('aria-expanded', String(open));
    });
  }

  function updateSidebarState(tabName, sourceButton = null) {
    document.querySelectorAll('.sidebar-module').forEach(button => button.classList.toggle('active', button.dataset.mainTab === tabName));
    document.querySelectorAll('.sidebar-home').forEach(button => button.classList.toggle('active', button === sourceButton));
    document.querySelectorAll('.sidebar-submenu button').forEach(button => button.classList.toggle('active', button === sourceButton));
    openGroup(tabName);
    if (moduleTitle) moduleTitle.textContent = labels[tabName] || 'BastCompta';
    if (pageTitle) pageTitle.textContent = sourceButton?.textContent?.trim() || labels[tabName] || '';
  }

  function sendNavigation(tabName, pageKey, clientAction) {
    const frame = frames[tabName];
    if (!frame) return;
    const send = () => {
      if (pageKey) frame.contentWindow?.postMessage({ type: 'BASTCOMPTA_SET_ACTIVE_PAGE', pageKey }, window.location.origin);
      if (clientAction) frame.contentWindow?.postMessage({ type: 'BASTCOMPTA_CLIENT_ACTION', action: clientAction }, window.location.origin);
    };
    if (frame.contentDocument?.readyState === 'complete') send();
    else frame.addEventListener('load', send, { once: true });
  }

  navButtons.forEach(button => {
    button.addEventListener('click', event => {
      const tabName = button.dataset.mainTab;
      const isModuleHeader = button.classList.contains('sidebar-module');
      const pageKey = button.dataset.pageKey || (isModuleHeader ? defaults[tabName] : '');
      const clientAction = button.dataset.clientAction || '';

      if (tabName === 'devis' && pageKey === 'peppol' && !currentSubscriptionState?.access?.accounting) {
        showSubscriptionModal(currentSubscriptionState);
        event.stopImmediatePropagation();
        return;
      }

      if (isModuleHeader && button.closest('.sidebar-group')?.classList.contains('open') && button.classList.contains('active')) {
        const group = button.closest('.sidebar-group');
        group.classList.toggle('open');
        button.setAttribute('aria-expanded', String(group.classList.contains('open')));
        event.stopImmediatePropagation();
        return;
      }

      switchMainTab(tabName);
      const actualTab = document.querySelector('.sidebar-module.active')?.dataset.mainTab || tabName;
      if (actualTab !== tabName) {
        const fallback = document.querySelector(`.sidebar-submenu [data-main-tab="${actualTab}"][data-page-key="${defaults[actualTab] || ''}"]`);
        updateSidebarState(actualTab, fallback);
        closeMobileSidebar();
        event.stopImmediatePropagation();
        return;
      }
      updateSidebarState(tabName, isModuleHeader ? null : button);
      sendNavigation(tabName, pageKey, clientAction);
      closeMobileSidebar();
      event.stopImmediatePropagation();
    }, true);
  });

  toggleBtn?.addEventListener('click', () => {
    shell?.classList.add('sidebar-open');
    toggleBtn.setAttribute('aria-expanded', 'true');
  });
  closeBtn?.addEventListener('click', closeMobileSidebar);
  backdrop?.addEventListener('click', closeMobileSidebar);
  shell?.addEventListener('click', event => {
    if (shell.classList.contains('sidebar-open') && event.target === shell) closeMobileSidebar();
  });
  sidebarSettingsBtn?.addEventListener('click', event => {
    const isOpen = settingsMenu?.classList.toggle('open');
    sidebarSettingsBtn.setAttribute('aria-expanded', String(Boolean(isOpen)));
    sidebarSettingsBtn.classList.toggle('active', Boolean(isOpen));
    event.stopPropagation();
  });

  function syncResponsiveNavigation() {
    if (window.matchMedia('(min-width: 901px)').matches) closeMobileSidebar();

    // Met à jour une valeur dépendante du viewport et force un recalcul fiable
    // après chargement, retour sur la page ou changement d'orientation.
    document.documentElement.style.setProperty('--bast-viewport-width', `${window.innerWidth}px`);

    if (shell) {
      void shell.offsetWidth;
    }
  }

  window.addEventListener('resize', syncResponsiveNavigation, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(syncResponsiveNavigation, 100), { passive: true });
  window.addEventListener('pageshow', syncResponsiveNavigation);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncResponsiveNavigation(); });

  syncResponsiveNavigation();
  requestAnimationFrame(syncResponsiveNavigation);
  setTimeout(syncResponsiveNavigation, 150);
  updateSidebarState('devis', document.querySelector('.sidebar-submenu [data-main-tab="devis"][data-page-key="quote"]'));
})();

/* Le défilement reste interne à chaque module. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#portalScreen iframe').forEach((frame) => {
    configureModuleIframe(frame);
    frame.addEventListener('load', () => {
      try {
        const childDocument = frame.contentDocument;
        if (!childDocument) return;
        childDocument.documentElement.style.setProperty('overflow-y', 'auto', 'important');
        childDocument.documentElement.style.setProperty('overflow-x', 'hidden', 'important');
        if (childDocument.body) {
          childDocument.body.style.setProperty('overflow-y', 'visible', 'important');
          childDocument.body.style.setProperty('overflow-x', 'hidden', 'important');
        }
      } catch (error) {
        console.warn('Impossible de configurer le défilement du module :', error);
      }
    });
  });
});
