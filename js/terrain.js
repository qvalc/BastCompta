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

const app = initializeApp(firebaseConfig, 'bastcompta-terrain');
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);

const loadingScreen = document.getElementById('terrainLoading');
const authScreen = document.getElementById('terrainAuth');
const homeScreen = document.getElementById('terrainHome');
const loginForm = document.getElementById('terrainLoginForm');
const emailInput = document.getElementById('terrainEmail');
const passwordInput = document.getElementById('terrainPassword');
const loginButton = document.getElementById('terrainLoginBtn');
const forgotButton = document.getElementById('terrainForgotBtn');
const authMessage = document.getElementById('terrainAuthMessage');
const welcome = document.getElementById('terrainWelcome');
const userEmail = document.getElementById('terrainUserEmail');
const accountButton = document.getElementById('terrainAccountBtn');
const accountMenu = document.getElementById('terrainAccountMenu');
const closeAccountButton = document.getElementById('closeAccountBtn');
const logoutButton = document.getElementById('terrainLogoutBtn');
const homeMessage = document.getElementById('terrainHomeMessage');

function showOnly(screen) {
  [loadingScreen, authScreen, homeScreen].forEach(item => item.classList.add('hidden'));
  screen.classList.remove('hidden');
}

function setAuthMessage(text = '', type = '') {
  authMessage.textContent = text;
  authMessage.className = `message${type ? ` ${type}` : ''}`;
}

function friendlyAuthError(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Adresse mail ou mot de passe incorrect.';
  if (code.includes('too-many-requests')) return 'Trop de tentatives. Réessaie un peu plus tard.';
  if (code.includes('network-request-failed')) return 'Connexion internet indisponible.';
  if (code.includes('invalid-email')) return 'Adresse mail invalide.';
  return error?.message || 'Connexion impossible.';
}

function userDisplayName(user) {
  const raw = user?.displayName || user?.email?.split('@')[0] || 'Sébastien';
  return String(raw).trim();
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  setAuthMessage('Connexion…');
  loginButton.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setAuthMessage(friendlyAuthError(error), 'error');
  } finally {
    loginButton.disabled = false;
  }
});

forgotButton.addEventListener('click', async () => {
  const email = emailInput.value.trim().toLowerCase();
  if (!email) {
    setAuthMessage('Indique d’abord ton adresse mail.', 'error');
    emailInput.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage('Le lien de réinitialisation a été envoyé.', 'success');
  } catch (error) {
    setAuthMessage(friendlyAuthError(error), 'error');
  }
});

accountButton.addEventListener('click', () => accountMenu.classList.remove('hidden'));
closeAccountButton.addEventListener('click', () => accountMenu.classList.add('hidden'));
logoutButton.addEventListener('click', async () => {
  accountMenu.classList.add('hidden');
  await signOut(auth);
});

function showComingSoon(label) {
  homeMessage.textContent = `${label} sera relié à la prochaine étape.`;
  window.setTimeout(() => { homeMessage.textContent = ''; }, 2600);
}

document.getElementById('newQuoteBtn').addEventListener('click', () => showComingSoon('La création rapide de devis'));
document.querySelectorAll('[data-coming]').forEach(button => {
  button.addEventListener('click', () => showComingSoon(button.querySelector('strong')?.textContent || 'Ce module'));
});

onAuthStateChanged(auth, user => {
  if (user) {
    welcome.textContent = `Bonjour ${userDisplayName(user)}`;
    userEmail.textContent = user.email || 'Compte BastCompta connecté';
    setAuthMessage('');
    showOnly(homeScreen);
  } else {
    passwordInput.value = '';
    showOnly(authScreen);
  }
});
