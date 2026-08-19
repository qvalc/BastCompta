if (new URLSearchParams(window.location.search).get("embedded") === "1") document.body.classList.add("bast-embedded");
// BastCompta - module Comptabilité

const STORAGE_KEY = window.BastComptaStorageKeys?.accounting || 'comptabilite-local-v1';
const DRIVE_SYNC_FILE_NAME = 'bastcompta-comptabilite-sync.json';

let googleAccessToken = null;
let googleDriveFiles = [];
let invoiceDriveFiles = [];
let purchasePdfDriveFiles = [];
let purchasePdfPanelOpen = false;
let selectedDriveFileId = '';
let selectedDriveFileIds = [];
let selectedPurchasePdfRowIndex = null;
const purchasePdfPreviewCache = new Map();

function notifyPortalBusinessChange(detail) {
  try {
    window.parent?.BastComptaPortal?.markChanged?.('comptabilite', detail);
  } catch (error) {
    console.warn('Signalement de modification indisponible', error);
  }
}

function notifyParentToRefreshGoogleToken() {
  try {
    window.parent.postMessage({
      type: 'BASTCOMPTA_REFRESH_TOKEN'
    }, window.location.origin);
  } catch (error) {
    console.error('Impossible de demander un refresh du token Google.', error);
  }
}

function resetGoogleDriveSession() {
  purchasePdfPreviewCache.forEach(url => URL.revokeObjectURL(url));
  purchasePdfPreviewCache.clear();
  googleAccessToken = null;
  googleDriveFiles = [];
  invoiceDriveFiles = [];
  purchasePdfDriveFiles = [];
  selectedDriveFileId = '';
  selectedDriveFileIds = [];
  selectedPurchasePdfRowIndex = null;
  if (window.gapi?.client) {
    gapi.client.setToken(null);
  }
}

async function handleGoogleDriveAuthError(status, showAlert = true) {
  if (status === 401) {
    resetGoogleDriveSession();
    notifyParentToRefreshGoogleToken();

    if (showAlert) {
      alert('La session Google Drive a expiré. Reconnexion en cours...');
    }

    return true;
  }

  return false;
}

function extractGoogleDriveErrorStatus(error) {
  return error?.status || error?.result?.error?.code || error?.code || null;
}

async function handleGoogleDriveException(error, showAlert = true) {
  const status = extractGoogleDriveErrorStatus(error);
  return handleGoogleDriveAuthError(status, showAlert);
}

function unescapeDriveQueryLiteral(value) {
  return String(value || '').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function localDriveQueryMatch(file = {}, q = '') {
  const query = String(q || '');
  if (!query) return true;

  if (/trashed\s*=\s*false/i.test(query) && file.trashed === true) return false;

  const mimeMatch = query.match(/mimeType\s*=\s*'((?:\\'|[^'])*)'/i);
  if (mimeMatch && String(file.mimeType || '') !== unescapeDriveQueryLiteral(mimeMatch[1])) return false;

  const exactNameMatch = query.match(/name\s*=\s*'((?:\\'|[^'])*)'/i);
  if (exactNameMatch) {
    return String(file.name || '') === unescapeDriveQueryLiteral(exactNameMatch[1]);
  }

  const containsMatches = Array.from(query.matchAll(/name\s+contains\s+'((?:\\'|[^'])*)'/gi))
    .map(match => unescapeDriveQueryLiteral(match[1]))
    .filter(Boolean);

  if (containsMatches.length) {
    const name = String(file.name || '').toLowerCase();
    const values = containsMatches.map(value => String(value).toLowerCase());
    const usesOr = /\bor\b/i.test(query);
    const ok = usesOr
      ? values.some(value => name.includes(value))
      : values.every(value => name.includes(value));
    if (!ok) return false;
  }

  return true;
}

async function listDriveFilesDirect(params = {}) {
  const files = await BastComptaDriveClient.listFiles(googleAccessToken, params);
  return { result: { files } };
}

async function driveFilesList(params, showAlert401 = true) {
  try {
    return await listDriveFilesDirect(params);
  } catch (error) {
    if (await handleGoogleDriveException(error, showAlert401)) {
      return null;
    }

    if (error?.status === 400 && params?.q) {
      console.warn('Requête Drive filtrée refusée, repli sur liste complète appDataFolder.', params.q, error);
      const fallback = await listDriveFilesDirect({
        spaces: params.spaces || 'appDataFolder',
        pageSize: params.pageSize || 100,
        orderBy: params.orderBy,
        fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,trashed)'
      });
      fallback.result.files = (fallback.result.files || []).filter(file => localDriveQueryMatch(file, params.q));
      return fallback;
    }

    throw error;
  }
}

async function googleDriveFetch(url, options = {}, showAlert401 = true) {
  const response = await BastComptaDriveClient.request(googleAccessToken, url, options);
  if (await handleGoogleDriveAuthError(response.status, showAlert401)) {
    return null;
  }
  return response;
}

function escapeDriveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}


const defaultData = {
  company: {
    name: '',
    period: '',
    notes: ''
  },
  purchases: [],
  sales: [],
  investments: [],
  assets: [],
  stock: [],
  losses: [],
  km: [],
  privateMovements: [],
  vat: {
    declarations: []
  },
  settings: {
    vatCarryover: 0,
    vatRegime: 'taxable',
    bankBalance: 0,
    cashBalance: 0,
    capitalStart: 0,
    retainedEarnings: 0,
    ownerAccountCarryover: 0,
    socialExemptionThreshold: 1881.76,
    socialContributionRate: 20.5,
    socialContributionFeeRate: 3.5
  }
};


const LOSS_TYPE_OPTIONS = [
  { value: 'cotisations_sociales', label: 'Cotisations sociales' },
  { value: 'taxe_circulation', label: 'Taxe de circulation' },
  { value: 'taxe_mise_circulation', label: 'Taxe de mise en circulation' },
  { value: 'taxe_communale', label: 'Taxe communale' },
  { value: 'precompte_immobilier_pro', label: 'Précompte immobilier pro' },
  { value: 'redevance_spw', label: 'Redevance SPW / administration' },
  { value: 'autre_taxe_sans_tva', label: 'Autre taxe sans TVA' },
  { value: 'frais_financiers', label: 'Frais financiers / banque' },
  { value: 'charges_exceptionnelles', label: 'Charges exceptionnelles' }
];

function getLossType(row) {
  return BastOperatingLedger.lossType(row);
}

function getLossTypeLabel(type) {
  return LOSS_TYPE_OPTIONS.find(option => option.value === type)?.label || 'Cotisations sociales';
}

function getVatRegime() {
  return BastVatRegime.get(data?.settings);
}

function isVatExempt() {
  return BastVatRegime.isExempt(getVatRegime());
}

function isVatMixed() {
  return BastVatRegime.isMixed(getVatRegime());
}

function getVatRegimeLabel() {
  return BastVatRegime.label(getVatRegime());
}

function purchaseVatAmount(row) {
  return BastAccountingCalculations.purchaseVat(row);
}

function isPurchaseVatRecoverable(row) {
  if (isVatExempt()) return false;
  return row?.deductible !== false;
}

function purchaseProfessionalCost(row) {
  return BastAccountingCalculations.purchaseProfessionalCost(row, isPurchaseVatRecoverable(row));
}

function applyVatRegimeRules() {
  BastVatRegime.applyRules(data, getVatRegime());
}

function hasExistingAccountingEntries() {
  return BastVatRegime.hasEntries(data);
}

function setVatRegime(value) {
  const currentRegime = getVatRegime();
  const requestedRegime = value || 'taxable';

  // Aucun traitement nécessaire lorsque l'utilisateur resélectionne
  // le régime déjà actif.
  if (requestedRegime === currentRegime) return;

  // Sécurité absolue : le régime TVA ne peut plus être modifié
  // dès qu'une écriture comptable existe dans l'exercice.
  if (hasExistingAccountingEntries()) {
    alert(
      "Impossible de modifier le régime TVA : des écritures existent déjà dans cet exercice. " +
      "Crée un nouvel exercice vide pour utiliser un autre régime TVA."
    );

    // Le rendu remet immédiatement le sélecteur sur la valeur enregistrée.
    render();
    return;
  }

  data.settings.vatRegime = requestedRegime;
  applyVatRegimeRules();

  if (isVatExempt() && activePage === 'vat') {
    activePage = 'dashboard';
  }

  saveData(false);
}

function renderLossTypeSelect(row, index) {
  const currentType = getLossType(row);
  return `
            <select onchange="data.losses[${index}].type=this.value; saveData(false)">
              ${LOSS_TYPE_OPTIONS.map(option => `
                <option value="${escapeAttr(option.value)}" ${currentType === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
              `).join('')}
            </select>
          `;
}

const pageDefs = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'sales', label: 'Ventes' },
  { key: 'purchases', label: 'Achats' },
  { key: 'investments', label: 'Investissements' },
  { key: 'assets', label: 'Immobilisations' },
  { key: 'losses', label: 'Taxes & cotisations' },
  { key: 'stock', label: 'Stock' },
  { key: 'km', label: 'Kilomètres' },
  { key: 'private', label: "Prélèvements de l'exploitant" },
  { key: 'result', label: 'Compte de résultat' },
  { key: 'balance', label: 'Bilan simplifié' },
  { key: 'vat', label: 'TVA' },
];

let data = loadData();
let activePage = 'dashboard';
let expandedVatDeclarationId = '';

function goToPage(pageKey) {
  activePage = pageKey;
  render();
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);
    return mergeDeep(structuredClone(defaultData), JSON.parse(raw));
  } catch {
    return structuredClone(defaultData);
  }
}

function mergeDeep(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function getSyncDriveFileName() {
  return DRIVE_SYNC_FILE_NAME;
}

async function saveSyncToDrive(showErrorAlert = false) {
  if (!googleAccessToken) return false;

  try {
    const fileName = getSyncDriveFileName();
    const syncPayload = mergeDeep(structuredClone(defaultData), data || {});
    const existing = await BastAnnualJsonDrive.findByName({
      fileName, listFiles: driveFilesList, escapeQuery: escapeDriveQueryValue
    });
    if (existing === undefined) return false;
    const saved = await BastAnnualJsonDrive.upload({
      sourceData: syncPayload,
      fileName,
      fileId: existing?.id || '',
      accessToken: googleAccessToken,
      fetchDrive: googleDriveFetch
    });
    return !!saved;
  } catch (error) {
    console.error(error);
    if (showErrorAlert) {
      alert('La sauvegarde Google Drive automatique a échoué.');
    }
    return false;
  }
}

async function loadSyncDataFromDriveIfAvailable() {
  if (!googleAccessToken) return false;

  try {
    const fileName = getSyncDriveFileName();
    const file = await BastAnnualJsonDrive.findByName({
      fileName, listFiles: driveFilesList, escapeQuery: escapeDriveQueryValue
    });
    if (file === undefined) return false;
    if (!file) return false;
    const parsed = await BastAnnualJsonDrive.read({
      fileId: file.id, accessToken: googleAccessToken, fetchDrive: googleDriveFetch
    });
    if (!parsed) return false;
    data = mergeDeep(structuredClone(defaultData), parsed || {});
    ensureVatStructures();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function loadCurrentYearJsonFromDriveIfAvailable() {
  if (!googleAccessToken) return false;

  try {
    const currentYear = String(new Date().getFullYear());

    const files = await BastAnnualJsonDrive.listYear(driveFilesList, currentYear);
    if (!files) return false;

    if (!files.length) return false;

    const fileToLoad = BastAnnualJsonDrive.selectYearFile(files, currentYear);
    selectedDriveFileId = fileToLoad.id;
    const parsed = await BastAnnualJsonDrive.read({
      fileId: fileToLoad.id, accessToken: googleAccessToken, fetchDrive: googleDriveFetch
    });
    if (!parsed) return false;
    data = mergeDeep(structuredClone(defaultData), parsed || {});
    ensureVatStructures();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function saveCurrentYearJsonToDrive(showErrorAlert = false) {
  if (!googleAccessToken) return false;

  try {
    const fileName = getDriveFileName();
    let targetFileId = selectedDriveFileId || '';

    if (!targetFileId) {
      const existing = await BastAnnualJsonDrive.findByName({
        fileName,
        listFiles: driveFilesList,
        escapeQuery: escapeDriveQueryValue
      });
      if (existing === undefined) return false;
      if (existing) targetFileId = existing.id;
    }
    const saved = await BastAnnualJsonDrive.upload({
      sourceData: data, fileName, fileId: targetFileId,
      accessToken: googleAccessToken, fetchDrive: googleDriveFetch
    });
    if (!saved) return false;
    selectedDriveFileId = saved.id;
    await loadDriveFiles();
    return true;
  } catch (error) {
    console.error(error);
    if (showErrorAlert) {
      alert("La sauvegarde Google Drive a échoué.");
    }
    return false;
  }
}

async function saveData(showAlert = true) {
  ensureVatStructures();
  ensurePurchaseRowIds();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const chantierSynced = await syncPurchasesToChantiers(showAlert && !!googleAccessToken);

  if (showAlert) {
    if (googleAccessToken) {
      const synced = await saveCurrentYearJsonToDrive(true);
      alert(synced
        ? `Données sauvegardées localement et sur Google Drive${chantierSynced ? ' + chantiers mis à jour' : ''}.`
        : `Données sauvegardées localement${chantierSynced ? ' + chantiers mis à jour' : ''}.`);
    } else {
      alert(`Données sauvegardées localement${chantierSynced ? ' + chantiers mis à jour' : ''}.`);
    }
  }

  render();
}

function toggleFileMenu(event) {
  event.stopPropagation();
  const dropdown = event.currentTarget.closest('.dropdown');
  if (!dropdown) return;
  document.querySelectorAll('.dropdown.open').forEach(el => {
    if (el !== dropdown) el.classList.remove('open');
  });
  dropdown.classList.toggle('open');
}

function closeFileMenu() {
  document.querySelectorAll('.dropdown.open').forEach(el => el.classList.remove('open'));
}

function exportDataLocal() {
  const fileName = getDriveFileName();
  BastFileUtils.downloadJson(data, fileName);
}

function importDataLocal() {
  const input = document.getElementById('localJsonImportInput');
  if (!input) return;
  input.value = '';
  input.click();
}

async function handleLocalJsonImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const parsed = await BastFileUtils.parseJsonFile(file);
    data = mergeDeep(structuredClone(defaultData), parsed);
    saveData(false);
    alert(`Import réussi : ${file.name}`);
  } catch (error) {
    console.error(error);
    alert("Le fichier sélectionné n'est pas un JSON valide.");
  }
}

async function importDataFromDriveMenu() {
  activePage = 'gdrive';
  render();
  await importJsonFromDrive();
}

async function openDriveDownloadManager() {
  activePage = 'gdrive';
  render();
  await loadDriveFiles();
}

function isDriveFileChecked(fileId) {
  return selectedDriveFileIds.includes(fileId);
}

function toggleDriveFileSelection(fileId, checked) {
  if (checked) {
    if (!selectedDriveFileIds.includes(fileId)) {
      selectedDriveFileIds.push(fileId);
    }
  } else {
    selectedDriveFileIds = selectedDriveFileIds.filter(id => id !== fileId);
  }
  render();
}

function selectDriveFileForImport(fileId) {
  selectedDriveFileId = fileId || '';
  render();
}

function selectAllDriveFiles() {
  selectedDriveFileIds = googleDriveFiles.map(file => file.id);
  render();
}

function clearDriveFileSelection() {
  selectedDriveFileIds = [];
  render();
}

function normalizeInvoiceNumberForDrive(value) {
  return String(value || '').trim();
}

function getInvoiceDriveFileForNumber(invoiceNumber) {
  const wanted = normalizeInvoiceNumberForDrive(invoiceNumber).toLowerCase();
  if (!wanted) return null;

  return invoiceDriveFiles.find(file => {
    const fileName = String(file.name || '').toLowerCase();
    if (!fileName.startsWith('facture-')) return false;
    const fileNumber = fileName
      .replace(/^facture-/i, '')
      .replace(/\.json$/i, '')
      .trim();
    return fileNumber === wanted;
  }) || null;
}

async function findInvoiceDriveFileForNumber(invoiceNumber, showAlert401 = false) {
  const normalized = normalizeInvoiceNumberForDrive(invoiceNumber);
  if (!normalized || !googleAccessToken || !window.gapi?.client) return null;

  const cached = getInvoiceDriveFileForNumber(normalized);
  if (cached) return cached;

  try {
    const list = await driveFilesList({
      spaces: 'appDataFolder',
      q: `mimeType='application/json' and trashed=false and name contains 'facture-' and name contains '${escapeDriveQueryValue(normalized)}'`,
      orderBy: 'modifiedTime desc',
      pageSize: 20,
      fields: 'files(id, name, modifiedTime)'
    }, showAlert401);

    if (!list) return null;
    const files = list.result.files || [];
    invoiceDriveFiles = [...invoiceDriveFiles, ...files].filter((file, index, all) =>
      all.findIndex(item => item.id === file.id) === index
    );
    return getInvoiceDriveFileForNumber(normalized);
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function loadInvoiceDriveFiles(showAlert401 = false) {
  if (!googleAccessToken || !window.gapi?.client) return [];

  try {
    const list = await driveFilesList({
      spaces: 'appDataFolder',
      q: `mimeType='application/json' and trashed=false and name contains 'facture-'`,
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      fields: 'files(id, name, modifiedTime)'
    }, showAlert401);

    if (!list) return invoiceDriveFiles;
    invoiceDriveFiles = (list.result.files || []).filter(file => String(file.name || '').toLowerCase().endsWith('.json'));
    return invoiceDriveFiles;
  } catch (error) {
    console.error(error);
    return invoiceDriveFiles;
  }
}

async function openSalesInvoicePreview(invoiceNumber) {
  const normalized = normalizeInvoiceNumberForDrive(invoiceNumber);
  if (!normalized) {
    alert('Aucun numéro de facture sur cette ligne.');
    return;
  }

  if (!getInvoiceDriveFileForNumber(normalized)) {
    await findInvoiceDriveFileForNumber(normalized, true);
  }

  if (!getInvoiceDriveFileForNumber(normalized)) {
    alert(`Aucune facture trouvée dans Google Drive pour le numéro ${normalized}.`);
    render();
    return;
  }

  const invoiceFile = getInvoiceDriveFileForNumber(normalized);
  const opener = window.parent?.openInvoicePrintPreviewFromAccounting;
  if (typeof opener === 'function') {
    await opener(normalized, invoiceFile?.id || '');
    return;
  }

  alert('Ouvre le fichier via le portail BastCompta pour afficher l’aperçu d’impression de la facture.');
}

window.openSalesInvoicePreview = openSalesInvoicePreview;

function getPurchasePdfFileById(fileId) {
  if (!fileId) return null;
  return purchasePdfDriveFiles.find(file => file.id === fileId) || null;
}

async function loadPurchasePdfDriveFiles(showAlert401 = false) {
  if (!googleAccessToken || !window.gapi?.client) return [];

  try {
    const files = await BastPurchasePdfDrive.list(driveFilesList, showAlert401);
    if (!files) return purchasePdfDriveFiles;
    purchasePdfDriveFiles = files;
    return purchasePdfDriveFiles;
  } catch (error) {
    console.error(error);
    return purchasePdfDriveFiles;
  }
}

function pickPurchasePdf(rowIndex) {
  const lockedDec = getClosedVatDeclarationForDate(data.purchases?.[rowIndex]?.date || '');
  if (lockedDec) {
    alert(getVatLockMessage(lockedDec));
    return;
  }

  if (!googleAccessToken) {
    alert('Connecte Google Drive depuis le portail BastCompta.');
    return;
  }

  selectedPurchasePdfRowIndex = rowIndex;
  const input = document.getElementById('purchasePdfUploadInput');
  if (!input) return;
  input.value = '';
  input.click();
}

async function handlePurchasePdfUpload(event) {
  const file = event.target.files?.[0];
  const rowIndex = selectedPurchasePdfRowIndex;
  selectedPurchasePdfRowIndex = null;

  if (!file || rowIndex === null || rowIndex === undefined) return;
  if (file.type !== 'application/pdf' && !String(file.name || '').toLowerCase().endsWith('.pdf')) {
    alert('Sélectionne un fichier PDF.');
    return;
  }

  if (!googleAccessToken) {
    alert('Connecte Google Drive depuis le portail BastCompta.');
    return;
  }

  try {
    const row = data.purchases[rowIndex] || {};
    const lockedDec = getClosedVatDeclarationForDate(row.date || '');
    if (lockedDec) {
      alert(getVatLockMessage(lockedDec));
      return;
    }
    const saved = await BastPurchasePdfDrive.upload({
      row,
      file,
      accessToken: googleAccessToken,
      fetchDrive: googleDriveFetch
    });
    if (!saved) return;
    data.purchases[rowIndex].pdfFileId = saved.id;
    data.purchases[rowIndex].pdfFileName = saved.name;
    data.purchases[rowIndex].pdfModifiedTime = saved.modifiedTime || '';

    await saveData(false);
    await saveCurrentYearJsonToDrive(false);
    await loadPurchasePdfDriveFiles(false);
    render();
    alert('Facture PDF ajoutée à Google Drive.');
  } catch (error) {
    console.error(error);
    alert("Échec de l'envoi de la facture PDF vers Google Drive.");
  }
}

async function openPurchasePdf(fileId) {
  if (!googleAccessToken) {
    alert('Connecte Google Drive depuis le portail BastCompta.');
    return;
  }

  if (!fileId) {
    alert('Aucun PDF lié à cette ligne.');
    return;
  }

  const cachedUrl = purchasePdfPreviewCache.get(fileId);
  if (cachedUrl) {
    window.open(cachedUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // Ouvrir la fenêtre pendant le clic utilisateur évite le blocage des pop-ups
  // et donne immédiatement un retour visuel pendant le téléchargement Drive.
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    alert('Le navigateur a bloqué la fenêtre. Autorise les fenêtres contextuelles pour BastCompta.');
    return;
  }

  try {
    previewWindow.opener = null;
    previewWindow.document.title = 'Chargement de la facture';
    previewWindow.document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font-family:Arial,sans-serif;background:#f5f7fa;color:#1f2937;">
        <div style="text-align:center;max-width:460px;">
          <h2 style="margin:0 0 12px;">Chargement de la facture…</h2>
          <p style="margin:0;color:#6b7280;">Le PDF est récupéré depuis Google Drive.</p>
        </div>
      </div>`;

    const blob = await BastPurchasePdfDrive.download({
      fileId,
      accessToken: googleAccessToken,
      fetchDrive: googleDriveFetch
    });
    if (!blob) {
      previewWindow.close();
      return;
    }
    const pdfBlob = blob.type === 'application/pdf'
      ? blob
      : new Blob([blob], { type: 'application/pdf' });
    const url = URL.createObjectURL(pdfBlob);

    purchasePdfPreviewCache.set(fileId, url);
    previewWindow.location.replace(url);
  } catch (error) {
    console.error(error);
    if (!previewWindow.closed) {
      previewWindow.document.title = 'Erreur de chargement';
      previewWindow.document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font-family:Arial,sans-serif;background:#f5f7fa;color:#1f2937;">
          <div style="text-align:center;max-width:460px;">
            <h2 style="margin:0 0 12px;">Impossible d’ouvrir ce PDF</h2>
            <p style="margin:0;color:#6b7280;">Le document n’a pas pu être téléchargé depuis Google Drive.</p>
          </div>
        </div>`;
    }
  }
}

async function deletePurchasePdf(fileId) {
  if (!googleAccessToken) {
    alert('Connecte Google Drive depuis le portail BastCompta.');
    return;
  }

  if (!fileId) return;
  if (!await BastUI.confirm('Supprimer définitivement cette facture PDF de Google Drive ?',{type:'danger',title:'Supprimer le PDF'})) return;

  try {
    const removed = await BastPurchasePdfDrive.remove({
      fileId,
      accessToken: googleAccessToken,
      fetchDrive: googleDriveFetch
    });
    if (!removed) return;
    BastPurchasePdfDrive.unlinkPurchases(data.purchases, fileId);

    await saveData(false);
    await saveCurrentYearJsonToDrive(false);
    await loadPurchasePdfDriveFiles(false);
    render();
    alert('Facture PDF supprimée.');
  } catch (error) {
    console.error(error);
    alert('Erreur lors de la suppression du PDF.');
  }
}

function getPurchasePdfYear(file) {
  return BastPurchasePdfDrive.year(file);
}

function setPurchasePdfPanelOpen(isOpen) {
  purchasePdfPanelOpen = !!isOpen;
}

function renderPurchasePdfTable(files) {
  return `
    <div style="overflow:auto; margin-top:10px;">
      <table class="table-purchases" style="table-layout:fixed; width:100%;">
        <colgroup>
          <col style="width: 45%;">
          <col style="width: 160px;">
          <col style="width: 220px;">
        </colgroup>
        <thead>
          <tr>
            <th>Fichier PDF</th>
            <th>Modifié le</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${files.map(file => {
            const modified = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('fr-BE') : '—';
            return `
              <tr>
                <td>${escapeHtml(file.name || 'facture.pdf')}</td>
                <td>${escapeHtml(modified)}</td>
                <td>
                  <div class="inline-actions">
                    <button type="button" onclick='openPurchasePdf(${JSON.stringify(file.id)})'>Consulter</button>
                    <button type="button" class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" onclick='deletePurchasePdf(${JSON.stringify(file.id)})'><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderPurchasePdfList() {
  if (!googleAccessToken) {
    return '<div class="muted-box">Connecte Google Drive pour afficher les factures PDF d’achat.</div>';
  }

  if (!purchasePdfDriveFiles.length) {
    return '<div class="muted-box">Aucune facture PDF d’achat trouvée sur Google Drive.</div>';
  }

  const groups = purchasePdfDriveFiles.reduce((acc, file) => {
    const year = getPurchasePdfYear(file);
    if (!acc[year]) acc[year] = [];
    acc[year].push(file);
    return acc;
  }, {});

  const years = Object.keys(groups).sort((a, b) => {
    if (a === 'Sans année') return 1;
    if (b === 'Sans année') return -1;
    return Number(b) - Number(a);
  });

  return years.map(year => {
    const files = groups[year].slice().sort((a, b) => {
      const aTime = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
      const bTime = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { numeric: true });
    });

    return `
      <section style="margin-top:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:8px;border-bottom:1px solid #dbe3ec;">
          <h4 style="margin:0;font-size:1rem;">${escapeHtml(year)}</h4>
          <span style="font-size:.86rem;color:#64748b;">${files.length} fichier${files.length > 1 ? 's' : ''}</span>
        </div>
        ${renderPurchasePdfTable(files)}
      </section>
    `;
  }).join('');
}

window.pickPurchasePdf = pickPurchasePdf;
window.handlePurchasePdfUpload = handlePurchasePdfUpload;
window.openPurchasePdf = openPurchasePdf;
window.deletePurchasePdf = deletePurchasePdf;
window.setPurchasePdfPanelOpen = setPurchasePdfPanelOpen;

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return;

  const message = event.data || {};

  if (message.type === 'BASTCOMPTA_GOOGLE_TOKEN') {
    googleAccessToken = message.accessToken || null;

    if (!googleAccessToken) {
      resetGoogleDriveSession();
      render();
      return;
    }

    if (googleAccessToken && window.gapi?.client) {
      try {
        gapi.client.setToken({ access_token: googleAccessToken });
        await loadCurrentYearJsonFromDriveIfAvailable();
        await loadDriveFiles();
        await loadPurchasePdfDriveFiles(false);
      } catch (error) {
        console.error(error);
      }
    }

    render();
  }

  if (message.type === 'BASTCOMPTA_GOOGLE_LOGOUT') {
    resetGoogleDriveSession();
    render();
  }

  if (message.type === 'BASTCOMPTA_CHANTIERS_UPDATED') {
    // Rafraîchit les listes déroulantes de chantiers dans les achats sans attendre un rechargement complet.
    render();
  }
});

async function initDriveClientOnly() {
  try {
    await new Promise((resolve) => gapi.load('client', resolve));

    await gapi.client.init({
      apiKey: 'AIzaSyC88moDvAWg7LFeJAgUSxXJV4nhAigSOKU',
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    });

    if (googleAccessToken) {
      gapi.client.setToken({ access_token: googleAccessToken });
    }
  } catch (error) {
    console.error(error);
    alert("Erreur lors de l'initialisation du client Google Drive.");
  }
}

function getDriveFileName() {
  return BastAccountingExercise.fileName(data);
}

function getDriveFileNameFromData(sourceData) {
  return BastAccountingExercise.fileName(sourceData);
}

function openIntervat() {
  if (isVatExempt()) {
    alert('Régime exonéré TVA – article 44 : aucune déclaration périodique Intervat n’est préparée par BastCompta.');
    return;
  }
  window.open('https://finances.belgium.be/fr/E-services/Intervat', '_blank', 'noopener');
}

function commitPendingInputChanges() {
  const activeEl = document.activeElement;
  if (activeEl && typeof activeEl.blur === 'function') {
    activeEl.blur();
  }
}

function buildNextExerciseData(targetYear) {
  return BastAccountingExercise.createNext({ currentData: data, defaults: defaultData, totals: totals(), targetYear });
}

function downloadJsonFile(sourceData, fileName = '') {
  const finalFileName = fileName || getDriveFileNameFromData(sourceData);
  BastFileUtils.downloadJson(sourceData, finalFileName);
}

async function uploadJsonObjectToDrive(sourceData, fileName = '') {
  if (!googleAccessToken) {
    alert("Connecte Google Drive depuis le portail BastCompta.");
    return false;
  }

  const finalFileName = fileName || getDriveFileNameFromData(sourceData);
  const existing = await BastAnnualJsonDrive.findByName({
    fileName: finalFileName,
    listFiles: driveFilesList,
    escapeQuery: escapeDriveQueryValue
  });
  if (existing === undefined) return false;
  const saved = await BastAnnualJsonDrive.upload({
    sourceData, fileName: finalFileName, fileId: existing?.id || '',
    accessToken: googleAccessToken, fetchDrive: googleDriveFetch
  });
  if (!saved) return false;
  selectedDriveFileId = saved.id;
  await loadDriveFiles();
  return saved;
}

async function createNextExerciseFile() {
  commitPendingInputChanges();
  await saveData(false);

  const currentYear = parseInt(data.company.period, 10) || new Date().getFullYear();
  const suggestedYear = currentYear + 1;
  const answer = prompt("Année du nouvel exercice :", suggestedYear);
  if (answer === null) return;

  const targetYear = String(answer).trim();
  const destinationDefault = googleAccessToken ? 'drive' : 'pc';
  const destinationAnswer = prompt("Destination du nouveau fichier : pc ou drive ?", destinationDefault);
  if (destinationAnswer === null) return;

  const destination = String(destinationAnswer).trim().toLowerCase();

  try {
    const nextData = buildNextExerciseData(targetYear);
    const fileName = getDriveFileNameFromData(nextData);

    if (destination === 'drive') {
      const saved = await uploadJsonObjectToDrive(nextData, fileName);
      alert(`Le fichier de l'exercice ${targetYear} a été envoyé sur Google Drive : ${saved.name}`);
      return;
    }

    if (destination !== 'pc') {
      throw new Error('Destination invalide.');
    }

    downloadJsonFile(nextData, fileName);
    alert(`Le fichier de l'exercice ${targetYear} a été téléchargé sur ce PC.`);
  } catch (error) {
    console.error(error);
    alert("Impossible de créer le nouvel exercice. Vérifie l'année ou la destination choisie.");
  }
}

async function loadDriveFiles() {
  if (!googleAccessToken) {
    alert("Connecte Google Drive depuis le portail BastCompta.");
    return;
  }

  try {
    const files = await BastAnnualJsonDrive.list(driveFilesList);
    if (!files) return;
    googleDriveFiles = files;
    const validIds = new Set(googleDriveFiles.map(file => file.id));
    selectedDriveFileIds = selectedDriveFileIds.filter(id => validIds.has(id));

    if (selectedDriveFileId && !validIds.has(selectedDriveFileId)) {
      selectedDriveFileId = '';
    }

    if (!selectedDriveFileId && googleDriveFiles.length) {
      selectedDriveFileId = googleDriveFiles[0].id;
    }

    render();
  } catch (error) {
    console.error(error);

    alert("Impossible de charger la liste des sauvegardes Drive. Vérifie la connexion Google Drive dans le portail.");
  }
}

async function importSelectedJsonFromDrive() {
  if (!googleAccessToken) {
    alert("Connecte Google Drive depuis le portail BastCompta.");
    return;
  }

  if (!selectedDriveFileId) {
    alert('Sélectionne d’abord une sauvegarde Google Drive.');
    return;
  }

  try {
    const file = googleDriveFiles.find(f => f.id === selectedDriveFileId);

    const parsed = await BastAnnualJsonDrive.read({
      fileId: selectedDriveFileId, accessToken: googleAccessToken, fetchDrive: googleDriveFetch
    });
    if (!parsed) return;
    data = mergeDeep(structuredClone(defaultData), parsed);
    ensureVatStructures();
    saveData(false);
    alert(`Import réussi : ${file ? file.name : 'fichier sélectionné'}`);
  } catch (error) {
    console.error(error);
    alert("Échec de l'import depuis Google Drive.");
  }
}

async function downloadSelectedJsonFromDrive() {
  if (!googleAccessToken) {
    alert("Connecte Google Drive depuis le portail BastCompta.");
    return;
  }

  const fileIds = selectedDriveFileIds.length ? [...selectedDriveFileIds] : (selectedDriveFileId ? [selectedDriveFileId] : []);

  if (!fileIds.length) {
    activePage = 'gdrive';
    render();
    alert('Choisis au moins une sauvegarde Google Drive.');
    return;
  }

  try {
    for (const fileId of fileIds) {
      const file = googleDriveFiles.find(f => f.id === fileId);

      const content = await BastAnnualJsonDrive.read({
        fileId, accessToken: googleAccessToken, fetchDrive: googleDriveFetch, asText: true
      });
      if (content === null) return;
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file?.name || 'sauvegarde-drive.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    alert(fileIds.length === 1
      ? 'Téléchargement terminé.'
      : `${fileIds.length} fichiers ont été téléchargés vers ce PC.`);
  } catch (error) {
    console.error(error);
    alert("Échec du téléchargement depuis Google Drive.");
  }
}

async function deleteSelectedJsonFromDrive() {
  if (!googleAccessToken) {
    alert("Connecte Google Drive depuis le portail BastCompta.");
    return;
  }

  const fileIds = selectedDriveFileIds.length ? [...selectedDriveFileIds] : (selectedDriveFileId ? [selectedDriveFileId] : []);

  if (!fileIds.length) {
    alert('Coche au moins une sauvegarde à supprimer.');
    return;
  }

  if (!await BastUI.confirm(fileIds.length === 1
    ? 'Supprimer cette sauvegarde définitivement ?'
    : `Supprimer définitivement ces ${fileIds.length} sauvegardes ?`,{type:'danger',title:'Supprimer les sauvegardes'})) return;

  try {
    for (const fileId of fileIds) {
      const removed = await BastAnnualJsonDrive.remove({
        fileId, accessToken: googleAccessToken, fetchDrive: googleDriveFetch
      });
      if (!removed) return;
    }

    selectedDriveFileIds = [];
    if (fileIds.includes(selectedDriveFileId)) {
      selectedDriveFileId = '';
    }

    await loadDriveFiles();
    alert(fileIds.length === 1 ? 'Sauvegarde supprimée.' : `${fileIds.length} sauvegardes supprimées.`);
  } catch (error) {
    console.error(error);
    alert('Erreur lors de la suppression.');
  }
}

function pickLocalJsonForDrive() {
  if (!googleAccessToken) {
    alert("Connecte Google Drive depuis le portail BastCompta.");
    return;
  }

  const input = document.getElementById('localJsonToDriveInput');
  if (!input) return;

  input.value = '';
  input.click();
}

async function uploadLocalJsonToDrive(event) {
  if (!googleAccessToken) {
    alert("Connecte Google Drive depuis le portail BastCompta.");
    return;
  }

  const pickedFiles = Array.from(event.target.files || []);
  if (!pickedFiles.length) return;

  try {
    let importedCount = 0;

    for (const file of pickedFiles) {
      const content = await file.text();

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        alert(`Le fichier ${file.name} n'est pas un JSON valide.`);
        continue;
      }

      const existing = await BastAnnualJsonDrive.findByName({
        fileName: file.name,
        listFiles: driveFilesList,
        escapeQuery: escapeDriveQueryValue
      });
      if (existing === undefined) return;
      const saved = await BastAnnualJsonDrive.upload({
        sourceData: parsed,
        fileName: file.name,
        fileId: existing?.id || '',
        accessToken: googleAccessToken,
        fetchDrive: googleDriveFetch
      });
      if (!saved) return;
      selectedDriveFileId = saved.id;
      importedCount += 1;
    }

    await loadDriveFiles();

    alert(importedCount <= 1
      ? 'Fichier local envoyé vers Google Drive.'
      : `${importedCount} fichiers locaux ont été envoyés vers Google Drive.`);
  } catch (error) {
    console.error(error);
    alert("Échec de l'envoi du fichier local vers Google Drive.");
  }
}

async function exportJsonToDrive() {
  if (!googleAccessToken) {
    alert("Connecte Google Drive depuis le portail BastCompta.");
    return;
  }

  const saved = await saveCurrentYearJsonToDrive(false);
  if (saved) {
    alert(`Export Google Drive réussi : ${getDriveFileName()}`);
  } else {
    alert("Échec de l'export vers Google Drive.");
  }
}

async function importJsonFromDrive() {
  await loadDriveFiles();

  if (!googleDriveFiles.length) {
    alert('Aucune sauvegarde JSON trouvée sur Google Drive.');
    return;
  }

  if (!selectedDriveFileId) {
    selectedDriveFileId = googleDriveFiles[0].id;
  }

  render();
}

function renderGoogleDrive() {
  const fileItems = googleDriveFiles.map(file => {
    const isImportSelected = selectedDriveFileId === file.id;
    const isChecked = isDriveFileChecked(file.id);
    const dateLabel = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('fr-BE') : 'Date inconnue';

    return `
          <div class="drive-file-item ${isImportSelected ? 'active' : ''}">
            <input type="radio" name="driveImportFile" ${isImportSelected ? 'checked' : ''} onchange="selectDriveFileForImport('${escapeAttr(file.id)}')"
              title="Choisir ce fichier pour le charger dans l’application">
            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleDriveFileSelection('${escapeAttr(file.id)}', this.checked)"
              title="Ajouter ce fichier à la sélection pour téléchargement ou suppression">
            <div>
              <div class="drive-file-name">${escapeHtml(file.name)}</div>
              <div class="hint">Radio = charger dans l’application. Case = télécharger ou supprimer un ou plusieurs fichiers.</div>
            </div>
            <div class="drive-file-date">${escapeHtml(dateLabel)}</div>
          </div>
        `;
  }).join('');

  const checkedCount = selectedDriveFileIds.length;

  return `
        <section class="page ${activePage === 'gdrive' ? 'active' : ''}">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Google Drive</h2>
              </div>
              <div class="inline-actions">
                <button onclick="loadDriveFiles()">Actualiser la liste</button>
              </div>
            </div>

            <div class="muted-box" style="margin-bottom:16px; line-height:1.7;">
              La connexion Google Drive se fait depuis le portail principal BastCompta.<br>
              Les actions rapides sont aussi disponibles dans le menu <strong>Fichier</strong> en haut de l’écran.
            </div>

            <div class="grid-2">
              <div class="muted-box">
                <strong>Nom qui sera utilisé pour le prochain export du document actuel :</strong><br>
                ${escapeHtml(getDriveFileName())}
                <br><br>
                Les sauvegardes sont créées sous forme de fichiers JSON distincts dans l’espace privé appDataFolder.
              <br>La sauvegarde automatique interne de la comptabilité/TVA reste masquée dans cette liste pour éviter toute suppression accidentelle.
              </div>

              <div class="muted-box">
                <strong>Conseil</strong><br>
                Renseigne au minimum le nom de l’entreprise et la période avant export.<br>
                Même nom de fichier = mise à jour du même JSON.<br>
                Nouveau nom = nouveau fichier.
              </div>
            </div>

            <div style="margin-top:16px;" class="card">
              <div class="section-head">
                <div>
                  <h3>Fichiers disponibles sur Google Drive</h3>
                  <div class="hint">Choisis un fichier à charger dans l’application, et coche un ou plusieurs fichiers pour les rapatrier vers ce PC ou les supprimer.</div>
                </div>
                <div class="inline-actions">
                  <button onclick="selectAllDriveFiles()">Tout cocher</button>
                  <button onclick="clearDriveFileSelection()">Tout décocher</button>
                </div>
              </div>

              <div class="inline-actions" style="margin-top:12px;">
                <button onclick="importSelectedJsonFromDrive()">Charger dans l’application</button>
                <button onclick="downloadSelectedJsonFromDrive()">Télécharger vers ce PC${checkedCount ? ` (${checkedCount})` : ''}</button>
                <button onclick="pickLocalJsonForDrive()">Importer des fichiers du PC vers Drive</button>
                <button class="danger" onclick="deleteSelectedJsonFromDrive()">Supprimer${checkedCount ? ` (${checkedCount})` : ''}</button>
              </div>

              <div class="drive-file-list">
                ${fileItems || '<div class="muted-box">Aucune sauvegarde JSON trouvée sur Google Drive.</div>'}
              </div>
            </div>
          </div>
        </section>
      `;
}

function money(value) {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function num(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function isCreditNoteSalesRow(row) {
  return BastAccountingCalculations.isCreditNote(row);
}

function salesRowTvac(row) {
  return BastAccountingCalculations.signedSalesTvac(row);
}

function salesRowNet(row) {
  return BastAccountingCalculations.salesNet(row, isVatExempt());
}

function salesRowVat(row) {
  return BastAccountingCalculations.salesVat(row, isVatExempt());
}

function rowHtvaToTvac(htva, rate) {
  return BastAccountingCalculations.tvacFromHtva(htva, rate);
}

function round2(value) {
  return BastAccountingCalculations.round2(value);
}


const CHANTIERS_STORAGE_KEY = window.BastComptaStorageKeys?.clients || 'bastcompta-chantiers-v1';
const CHANTIERS_DRIVE_SYNC_FILE_NAME = 'bastcompta-chantiers-sync.json';

function loadChantiersLocalData() {
  try {
    const raw = localStorage.getItem(CHANTIERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      version: parsed.version || 1,
      projects: Array.isArray(parsed.projects) ? parsed.projects : []
    };
  } catch (error) {
    console.error('Impossible de lire les chantiers locaux.', error);
    return { version: 1, projects: [] };
  }
}

function saveChantiersLocalData(chantiersData) {
  localStorage.setItem(CHANTIERS_STORAGE_KEY, JSON.stringify(chantiersData, null, 2));
  try {
    window.parent?.postMessage({ type: 'BASTCOMPTA_CHANTIERS_UPDATED' }, window.location.origin);
  } catch (error) {
    console.error(error);
  }
}

function ensurePurchaseRowIds() {
  return BastPurchaseProjectSync.ensurePurchaseIds(data.purchases || []);
}

function getChantierProjectsForPurchaseSelect() {
  const chantiersData = loadChantiersLocalData();
  return BastPurchaseProjectSync.sortedProjects(chantiersData.projects || []);
}

function makeChantierPurchaseLabel(project) {
  return BastPurchaseProjectSync.projectLabel(project);
}

function setPurchaseChantierFromSelect(index, value) {
  const row = data.purchases[index];
  if (!row) return;
  const chantiersData = loadChantiersLocalData();
  const project = (chantiersData.projects || []).find(item => String(item.id || '') === String(value || ''));

  BastPurchaseProjectSync.assignProject(row, project);

  updateAccountingRowField('purchases', index, 'chantierSiteName', row.chantierSiteName);
}

async function syncPurchasesToChantiers(saveDrive = false) {
  const chantiersData = loadChantiersLocalData();
  const { changed } = BastPurchaseProjectSync.synchronize(chantiersData, data.purchases || []);

  if (changed) {
    saveChantiersLocalData(chantiersData);
    if (saveDrive && googleAccessToken) {
      await saveChantiersSyncToDrive(false);
    }
  }
  return changed;
}

async function saveChantiersSyncToDrive(showErrorAlert = false) {
  if (!googleAccessToken) return false;
  try {
    const chantiersData = loadChantiersLocalData();
    const content = JSON.stringify(chantiersData, null, 2);
    const existing = await driveFilesList({
      spaces: 'appDataFolder',
      q: `name='${CHANTIERS_DRIVE_SYNC_FILE_NAME}' and trashed=false`,
      fields: 'files(id, name)'
    }, false);
    if (!existing) return false;
    const files = existing.result.files || [];
    const isUpdate = files.length > 0;
    const metadata = isUpdate
      ? { name: CHANTIERS_DRIVE_SYNC_FILE_NAME }
      : { name: CHANTIERS_DRIVE_SYNC_FILE_NAME, parents: ['appDataFolder'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'application/json' }));
    const url = isUpdate
      ? `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=multipart&fields=id,name`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';
    const res = await googleDriveFetch(url, {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      body: form
    }, false);
    return !!res && res.ok;
  } catch (error) {
    console.error(error);
    if (showErrorAlert) alert('La synchronisation des chantiers vers Google Drive a échoué.');
    return false;
  }
}

function purchaseVatDisplay(index) {
  return BastAccountingCalculations.allocatedPurchaseVat(data.purchases, index);
}

function formatDateLocal(dateObj) {
  return BastVatPeriods.dateLocal(dateObj);
}

function getQuarterBounds(year, quarter) {
  return BastVatPeriods.bounds(year, quarter);
}

function nextBusinessDay(dateObj) {
  return BastVatPeriods.nextBusinessDay(dateObj);
}

function defaultQuarterDueDate(year, quarter) {
  return BastVatPeriods.dueDate(year, quarter);
}

function quarterLabel(year, quarter) {
  return BastVatPeriods.label(year, quarter);
}

function vatDeclarationTemplate(year = null, quarter = 1) {
  const currentYear = parseInt(year || data.company.period, 10) || new Date().getFullYear();
  return BastVatPeriods.template(currentYear, quarter,
    () => `vat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
}

function ensureDefaultVatQuarters(year) {
  if (!data.vat || !Array.isArray(data.vat.declarations)) return;
  const targetYear = parseInt(year || data.company.period, 10) || new Date().getFullYear();
  for (let q = 1; q <= 4; q += 1) {
    const exists = data.vat.declarations.some(dec => parseInt(dec.year, 10) === targetYear && parseInt(dec.quarter, 10) === q);
    if (!exists) {
      data.vat.declarations.push(vatDeclarationTemplate(targetYear, q));
    }
  }
}

function ensureVatStructures() {
  if (!data.vat || typeof data.vat !== 'object') data.vat = { declarations: [] };
  if (!Array.isArray(data.vat.declarations)) data.vat.declarations = [];
  ensureDefaultVatQuarters();
  data.vat.declarations.forEach(dec => {
    BastVatPeriods.ensureDeclaration(dec);
  });
}

function addVatDeclaration() {
  notifyPortalBusinessChange('Déclaration TVA ajoutée');
  ensureVatStructures();
  const currentYear = parseInt(data.company.period, 10) || new Date().getFullYear();
  const existingQuarters = data.vat.declarations
    .filter(dec => parseInt(dec.year, 10) === currentYear)
    .map(dec => parseInt(dec.quarter, 10))
    .filter(Number.isFinite);
  const nextQuarter = [1, 2, 3, 4].find(q => !existingQuarters.includes(q)) || 1;
  data.vat.declarations.push(vatDeclarationTemplate(currentYear, nextQuarter));
  expandedVatDeclarationId = data.vat.declarations[data.vat.declarations.length - 1].id;
  sortVatDeclarations();
  saveData(false);
}

function sortVatDeclarations() {
  ensureVatStructures();
  data.vat.declarations.sort((a, b) => {
    const aDate = `${a.startDate || ''}`;
    const bDate = `${b.startDate || ''}`;
    return aDate.localeCompare(bDate);
  });
}

function syncVatDeclarationPeriod(index) {
  const row = data.vat.declarations[index];
  if (!row) return;
  const bounds = getQuarterBounds(row.year, row.quarter);
  row.startDate = bounds.start;
  row.endDate = bounds.end;
  if (!row.dueDate) row.dueDate = defaultQuarterDueDate(row.year, row.quarter);
  sortVatDeclarations();
  saveData(false);
}

async function deleteVatDeclaration(index) {
  if (!await BastUI.confirm('Supprimer cette déclaration TVA ?',{type:'danger',title:'Supprimer la déclaration TVA'})) return;
  notifyPortalBusinessChange('Déclaration TVA supprimée');
  data.vat.declarations.splice(index, 1);
  saveData(false);
}


function toggleVatDeclarationExpanded(id) {
  expandedVatDeclarationId = expandedVatDeclarationId === id ? '' : id;
  render();
}

function toggleVatExtraCodes(id) {
  const dec = (data.vat?.declarations || []).find(item => item.id === id);
  if (!dec || dec.closed) return;
  dec.showExtraCodes = !dec.showExtraCodes;
  saveData(false);
}

function setVatClosed(index, checked) {
  const dec = data.vat.declarations[index];
  if (!dec) return;
  dec.closed = !!checked;
  if (dec.closed) {
    dec.showExtraCodes = false;
  }
  saveData(false);
}

function isDateInRange(value, startDate, endDate) {
  if (!value) return false;
  return value >= startDate && value <= endDate;
}

function getClosedVatDeclarationForDate(value) {
  if (!value || !data.vat || !Array.isArray(data.vat.declarations)) return null;
  return data.vat.declarations.find(dec => {
    if (!dec || !dec.closed) return false;
    const bounds = getQuarterBounds(dec.year, dec.quarter);
    return isDateInRange(value, dec.startDate || bounds.start, dec.endDate || bounds.end);
  }) || null;
}

function getVatLockMessage(dec) {
  return `Cette ligne appartient à la période TVA ${quarterLabel(dec.year, dec.quarter)} clôturée. Décoche « Clôturé » dans l’onglet TVA pour modifier les ventes ou achats de cette période.`;
}

function updateAccountingRowField(collection, index, field, value, options = {}) {
  notifyPortalBusinessChange('Écriture comptable modifiée');
  const row = data[collection]?.[index];
  if (!row) return false;

  const currentLockedDec = getClosedVatDeclarationForDate(row.date || '');
  if (currentLockedDec) {
    alert(getVatLockMessage(currentLockedDec));
    render();
    return false;
  }

  if (field === 'date') {
    const targetLockedDec = getClosedVatDeclarationForDate(value || '');
    if (targetLockedDec) {
      alert(getVatLockMessage(targetLockedDec));
      render();
      return false;
    }
  }

  if (options.type === 'number') {
    row[field] = parseFloat(value) || 0;
  } else if (options.type === 'boolean') {
    row[field] = value === true || value === 'true';
  } else {
    row[field] = value;
  }

  if (options.sort) sortByDate(data[collection]);
  saveData(false);
  if (collection === 'purchases') syncPurchasesToChantiers(false);
  return true;
}

async function deleteAccountingRow(collection, index) {
  const row = data[collection]?.[index];
  const lockedDec = getClosedVatDeclarationForDate(row?.date || '');
  if (lockedDec) {
    alert(getVatLockMessage(lockedDec));
    return;
  }
  if (!await BastUI.confirm('Placer cette ligne dans la corbeille ?',{type:'danger',title:'Mettre la ligne à la corbeille',confirmLabel:'Mettre à la corbeille'})) return;
  BastTrash.add({module:'Comptabilité',type:'Écriture',label:`${row?.date||''} ${row?.description||row?.client||''}`.trim()||'Écriture comptable',storageKey:STORAGE_KEY,path:[collection],item:row});
  notifyPortalBusinessChange('Écriture comptable supprimée');
  data[collection].splice(index, 1);
  saveData(false);
  if (collection === 'purchases') syncPurchasesToChantiers(false);
}

function getPeriodSales(startDate, endDate) {
  return data.sales.filter(row => isDateInRange(row.date, startDate, endDate));
}

function getPeriodPurchases(startDate, endDate) {
  return data.purchases.filter(row => isDateInRange(row.date, startDate, endDate));
}

function computeVatDeclaration(dec, previousCredit = 0) {
  const startDate = dec.startDate || getQuarterBounds(dec.year, dec.quarter).start;
  const endDate = dec.endDate || getQuarterBounds(dec.year, dec.quarter).end;
  const salesRows = getPeriodSales(startDate, endDate);
  const purchaseRows = getPeriodPurchases(startDate, endDate);
  const investmentRows = data.investments.filter(row =>
    isDateInRange(row.date, startDate, endDate)
  );

  const deductibleVat = data.purchases
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => isDateInRange(row.date, startDate, endDate) && row.deductible)
    .reduce((sum, { i }) => sum + purchaseVatDisplay(i), 0);

  return { startDate, endDate, ...BastVatDeclaration.compute({ declaration: dec, sales: salesRows,
    purchases: purchaseRows, investments: investmentRows, previousCredit,
    deductiblePurchaseVat: deductibleVat, vatExempt: isVatExempt() }) };
}

function getVatSituationText(dec, computed, outstanding) {
  const parts = [];
  if (computed.dueAmount > 0) {
    if (dec.paid && outstanding <= 0.009) {
      parts.push(`TVA payée : ${money(toNumber(dec.paymentAmount) || computed.dueAmount)}`);
    } else if (dec.paid && outstanding > 0.009) {
      parts.push(`TVA partiellement payée : ${money(dec.paymentAmount)} / solde ${money(outstanding)}`);
    } else {
      parts.push(`TVA à payer : ${money(computed.dueAmount)}`);
    }
  }
  if (computed.creditAmount > 0) {
    parts.push(dec.reimbursementRequested
      ? `Crédit TVA avec remboursement demandé : ${money(computed.creditAmount)}`
      : `Crédit TVA à reporter : ${money(computed.creditAmount)}`);
  }
  if (!parts.length) parts.push('TVA équilibrée');
  return parts.join(' · ');
}

function computeVatLedger() {
  ensureVatStructures();
  sortVatDeclarations();
  return BastVatDeclaration.ledger(data.vat.declarations, data.settings.vatCarryover, computeVatDeclaration);
}

function totals() {
  const currentYear = parseInt(data.company.period, 10) || new Date().getFullYear();
  // Le bilan doit reprendre la situation réellement ouverte du suivi TVA,
  // et non recalculer une TVA annuelle en soustrayant simplement les paiements.
  const vatLedger = isVatExempt() ? null : computeVatLedger();
  return BastAccountingSummary.summarize({
    data,
    currentYear,
    vatExempt: isVatExempt(),
    isPurchaseVatRecoverable,
    vatLedger,
  });
}

function setField(path, value) {
  // Les paramètres sont de vraies données métier : signaler la modification
  // au portail afin que la disquette propose bien une synchronisation Drive.
  notifyPortalBusinessChange('Paramètre comptable modifié');
  const keys = path.split('.');
  let ref = data;
  for (let i = 0; i < keys.length - 1; i++) ref = ref[keys[i]];
  ref[keys[keys.length - 1]] = value;
  saveData(false);
}

function sortByDate(array) {
  array.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date); // + récent en haut
  });
}

function addRow(key, row) {
  notifyPortalBusinessChange('Ligne comptable ajoutée');
  if (key === 'purchases' && row && !row._id) {
    row._id = `purchase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    row.chantierClientName = row.chantierClientName || '';
    row.chantierSiteName = row.chantierSiteName || '';
  }
  data[key].push(row);

  // Tri automatique
  if (key === 'purchases' || key === 'sales') {
    sortByDate(data[key]);
  }

  saveData(false);
  if (key === 'purchases') syncPurchasesToChantiers(false);
}

async function deleteRow(key, index) {
  if ((key === 'sales' || key === 'purchases') && getClosedVatDeclarationForDate(data[key]?.[index]?.date || '')) {
    alert(getVatLockMessage(getClosedVatDeclarationForDate(data[key]?.[index]?.date || '')));
    return;
  }
  if (!await BastUI.confirm('Placer cette ligne dans la corbeille ?',{type:'danger',title:'Mettre la ligne à la corbeille',confirmLabel:'Mettre à la corbeille'})) return;
  BastTrash.add({module:'Comptabilité',type:'Écriture',label:`${data[key]?.[index]?.date||''} ${data[key]?.[index]?.description||data[key]?.[index]?.client||''}`.trim()||'Ligne comptable',storageKey:STORAGE_KEY,path:[key],item:data[key][index]});
  notifyPortalBusinessChange('Ligne comptable supprimée');
  data[key].splice(index, 1);
  saveData(false);
}

function renderTabs() {
  const tabs = document.getElementById('tabs');
  const visiblePages = pageDefs.filter(page => !(isVatExempt() && page.key === 'vat'));
  tabs.innerHTML = visiblePages.map(page => `
        <button class="tab ${activePage === page.key ? 'active' : ''}" onclick="activePage='${page.key}'; render()">${page.label}</button>
      `).join('');
}

function renderPages() {
  const wrap = document.getElementById('pages');
  wrap.innerHTML = `
        ${renderDashboard()}
        ${renderSales()}
        ${renderPurchases()}
        ${renderVat()}
        ${renderInvestments()}
        ${renderAssets()}
        ${renderStock()}
        ${renderLosses()}
        ${renderKm()}
        ${renderPrivateMovements()}
        ${renderResult()}
        ${renderBalance()}
        ${renderGoogleDrive()}
        ${renderSettings()}
      `;
}

function renderDashboard() {
  const t = totals();
  return `
        <section class="page two-cols ${activePage === 'dashboard' ? 'active' : ''}">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Vue d'ensemble</h2>
              </div>
            </div>
            <div class="grid-2">
              <div class="muted-box">
                <strong>Société :</strong> ${escapeHtml(data.company.name || '—')}<br>
                <strong>Période :</strong> ${escapeHtml(data.company.period)}<br>
                <strong>Régime TVA :</strong> ${escapeHtml(getVatRegimeLabel())}<br>
                <strong>Lignes achats :</strong> ${data.purchases.length}<br>
                <strong>Lignes ventes :</strong> ${data.sales.length}<br>
                <strong>Investissements :</strong> ${t.investmentComputed.length}<br>
                <strong>Immobilisations manuelles :</strong> ${data.assets.length}<br>
                <strong>Km encodés :</strong> ${num(t.kmTotal, 0)} km<br>
                <strong>Prélèvements de l'exploitant :</strong> ${money(t.ownerAccountBalance)}
              </div>
              <div class="muted-box">
                <strong>TVA ventes :</strong> ${money(t.salesVat)}<br>
                <strong>TVA achats récupérable :</strong> ${money(t.purchasesVat)}<br>
                <strong>Report TVA :</strong> ${money(data.settings.vatCarryover)}<br>
                <strong>Stock estimé :</strong> ${money(t.stockValue)}
              </div>
            </div>
          </div>
          <div class="card">
            <div class="section-head"><h3>Contrôle rapide</h3></div>
            <div class="kv"><span>TVA nette</span><span class="${t.netVat > 0 ? 'status-bad' : 'status-good'}">${money(t.netVat)}</span></div>
            <div class="kv"><span>Actif simplifié</span><span>${money(t.assetsSide)}</span></div>
            <div class="kv"><span>Passif simplifié</span><span>${money(t.liabilitiesSide)}</span></div>
            <div class="kv"><span>Écart bilan</span><span class="${Math.abs(t.assetsSide - t.liabilitiesSide) < 0.01 ? 'status-good' : 'status-bad'}">${money(t.assetsSide - t.liabilitiesSide)}</span></div>
            <div class="kv">
  <span>Résultat estimé</span>
  <span class="${t.estimatedProfit >= 0 ? 'status-good' : 'status-bad'}">
    ${money(t.estimatedProfit)}
  </span>
</div>
          </div>
        </section>
      `;
}

function renderSales() {
  const t = totals();
  return renderTablePage({
    key: 'sales',
    title: 'Journal des ventes',
    hint: '',
    addLabel: 'Ajouter une vente',
    onAdd: `addRow('sales', { date: '', client: '', invoiceNumber: '', rate: ${isVatExempt() ? 0 : 21}, tvac: 0, documentType: 'invoice', documentStatus: 'sent' })`,
    tableAttrs: `class="table-sales"`,
    headers: ['Date', 'Client', 'N° Facture', 'Type', 'Taux TVA', 'TVAC', 'HTVA', 'TVA', 'Facture', ''],
    rows: data.sales.map((row, i) => {
      const hasInvoiceNumber = String(row.invoiceNumber || '').trim();
      const invoiceButton = hasInvoiceNumber
        ? `<button type="button" class="invoice-preview-btn" onclick="openSalesInvoicePreview('${escapeAttr(row.invoiceNumber || '')}')">Aperçu</button>`
        : '<span class="hint">&mdash;</span>';
      const lockedDec = getClosedVatDeclarationForDate(row.date || '');
      const locked = !!lockedDec;
      const lockAttr = locked ? 'disabled title="Période TVA clôturée"' : '';
      const vatRateAttr = (locked || isVatExempt()) ? 'disabled title="' + (isVatExempt() ? 'Régime exonéré TVA – taux forcé à 0 %' : 'Période TVA clôturée') + '"' : '';
      return `
  <tr ${locked ? 'title="Période TVA clôturée : ligne verrouillée"' : ''}>
    <td><input type="date" value="${escapeAttr(row.date)}" ${lockAttr} onchange="updateAccountingRowField('sales', ${i}, 'date', this.value, { sort: true })"></td>
    <td><input value="${escapeAttr(row.client)}" ${lockAttr} onchange="updateAccountingRowField('sales', ${i}, 'client', this.value)"></td>
    <td><input value="${escapeAttr(row.invoiceNumber || '')}" ${lockAttr} onchange="updateAccountingRowField('sales', ${i}, 'invoiceNumber', this.value)"></td>
    <td>${escapeHtml(getInvoiceImportTypeLabel(row))}</td>
    <td><input type="number" step="0.01" value="${num(isVatExempt() ? 0 : row.rate)}" ${vatRateAttr} onchange="updateAccountingRowField('sales', ${i}, 'rate', this.value, { type: 'number' })"></td>
    <td><input type="number" step="0.01" value="${num(salesRowTvac(row))}" ${lockAttr} onchange="updateAccountingRowField('sales', ${i}, 'tvac', this.value, { type: 'number' })"></td>
    <td>${money(salesRowNet(row))}</td>
    <td>${money(salesRowVat(row))}</td>
    <td>${invoiceButton}</td>
    <td><button class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" ${locked ? 'disabled' : ''} onclick="deleteAccountingRow('sales', ${i})"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
  </tr>
`}).join(''),
    footer: `
  <div class="kv"><span>Total ventes HTVA</span><span>${money(t.salesNet)}</span></div>
  <div class="kv"><span>Total TVA ventes</span><span>${money(t.salesVat)}</span></div>
`
  });
}

function renderPurchases() {
  const t = totals();
  return `
    <section class="page ${activePage === 'purchases' ? 'active' : ''}">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Journal des achats</h2>
            <div class="hint">Chaque ligne garde le montant HTVA, le taux, le caractère déductible de la TVA et le PDF de la facture si disponible.</div>
          </div>
          <div class="inline-actions">
            <button class="primary" onclick="addRow('purchases', { date: '', supplier: '', invoiceNumber: '', rate: 21, htva: 0, category: 'frais_generaux', deductible: ${isVatExempt() ? false : true}, pdfFileId: '', pdfFileName: '' })">Ajouter un achat</button>
            <button type="button" onclick="loadPurchasePdfDriveFiles(true).then(() => render())">Actualiser les PDF</button>
          </div>
        </div>

        ${isVatExempt() ? `<div class="muted-box" style="margin-bottom:14px;"><strong>Régime exonéré TVA – article 44 :</strong> la TVA des achats n’est pas récupérable et est incluse automatiquement dans la charge professionnelle (TVAC).</div>` : (isVatMixed() ? `<div class="muted-box" style="margin-bottom:14px;"><strong>Régime mixte :</strong> choisis Oui ou Non pour la récupération de TVA sur chaque achat selon son affectation.</div>` : '')}

        <div style="overflow:auto;">
          <table class="table-purchases" style="table-layout:fixed; width:100%;">
            <colgroup>
  <col style="width: 115px;">   <!-- Date -->
  <col style="width: 170px;">   <!-- Fournisseur -->
  <col style="width: 135px;">   <!-- N° facture -->
  <col style="width: 85px;">    <!-- Type -->
  <col style="width: 70px;">    <!-- TVA -->
  <col style="width: 90px;">    <!-- HTVA -->
  <col style="width: 75px;">    <!-- Déductible -->
  <col style="width: 80px;">    <!-- TVA récup -->
  <col style="width: 85px;">    <!-- TVAC -->
  <col style="width: 82px;">    <!-- Aperçu -->
  <col style="width: 36px;">    <!-- Corbeille -->
</colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fournisseur</th>
                <th>N° Facture</th>
                <th>Type</th>
                <th>Taux TVA</th>
                <th>HTVA</th>
                <th>Déductible TVA</th>
                <th>TVA récup.</th>
                <th>TVAC</th>
                <th>Facture PDF</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${data.purchases.map((row, i) => {
    const linkedPdf = getPurchasePdfFileById(row.pdfFileId) || (row.pdfFileId ? { id: row.pdfFileId, name: row.pdfFileName || 'PDF lié' } : null);
    const lockedDec = getClosedVatDeclarationForDate(row.date || '');
    const locked = !!lockedDec;
    const lockAttr = locked ? 'disabled title="Période TVA clôturée"' : '';
    const deductibleAttr = (locked || isVatExempt()) ? 'disabled title="' + (isVatExempt() ? 'TVA non récupérable sous le régime article 44' : 'Période TVA clôturée') + '"' : '';
    const effectiveDeductible = isPurchaseVatRecoverable(row);
    return `
                <tr ${locked ? 'title="Période TVA clôturée : ligne verrouillée"' : ''}>
                  <td><input type="date" value="${escapeAttr(row.date)}" ${lockAttr} onchange="updateAccountingRowField('purchases', ${i}, 'date', this.value, { sort: true })"></td>
                  <td><input value="${escapeAttr(row.supplier)}" ${lockAttr} onchange="updateAccountingRowField('purchases', ${i}, 'supplier', this.value)"></td>
                  <td><input value="${escapeAttr(row.invoiceNumber || '')}" ${lockAttr} onchange="updateAccountingRowField('purchases', ${i}, 'invoiceNumber', this.value)"></td>
                  <td>
                    <select ${lockAttr} onchange="updateAccountingRowField('purchases', ${i}, 'category', this.value)">
                      <option value="marchandise" ${row.category === 'marchandise' ? 'selected' : ''}>Marchandise</option>
                      <option value="frais_generaux" ${(row.category || 'frais_generaux') === 'frais_generaux' ? 'selected' : ''}>Frais généraux</option>
                    </select>
                  </td>
                  <td><input type="number" step="0.01" value="${num(row.rate)}" ${lockAttr} onchange="updateAccountingRowField('purchases', ${i}, 'rate', this.value, { type: 'number' })"></td>
                  <td><input type="number" step="0.01" value="${num(row.htva)}" ${lockAttr} onchange="updateAccountingRowField('purchases', ${i}, 'htva', this.value, { type: 'number' })"></td>
                  <td>
                    <select ${deductibleAttr} onchange="updateAccountingRowField('purchases', ${i}, 'deductible', this.value, { type: 'boolean' })">
                      <option value="true" ${effectiveDeductible ? 'selected' : ''}>Oui</option>
                      <option value="false" ${!effectiveDeductible ? 'selected' : ''}>Non</option>
                    </select>
                  </td>
                  <td>${money(effectiveDeductible ? purchaseVatDisplay(i) : 0)}</td>
                  <td>${money(rowHtvaToTvac(row.htva, row.rate))}</td>
                  <td>
  ${linkedPdf
        ? `
        <button
          type="button"
          class="invoice-preview-btn"
          onclick='openPurchasePdf(${JSON.stringify(linkedPdf.id)})'
        >
          Aperçu
        </button>
      `
        : `
        <button
          type="button"
          class="invoice-preview-btn"
          ${locked ? 'disabled' : ''}
          onclick="pickPurchasePdf(${i})"
        >
          Ajouter
        </button>
      `
      }
</td>
                  <td><button class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" ${locked ? 'disabled' : ''} onclick="deleteAccountingRow('purchases', ${i})"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 14px;">
          <div class="kv"><span>Total achats en charges</span><span>${money(t.purchasesNet)}</span></div>
          <div class="kv"><span>dont frais généraux</span><span>${money(t.purchasesGeneralNet)}</span></div>
          <div class="kv"><span>dont marchandises</span><span>${money(t.purchasesMerchandiseNet)}</span></div>
          <div class="kv"><span>Total TVA récupérable</span><span>${money(t.purchasesVat)}</span></div>
        </div>
      </div>

      <div class="card">
        <details ${purchasePdfPanelOpen ? 'open' : ''} ontoggle="setPurchasePdfPanelOpen(this.open)">
          <summary style="display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;list-style:none;user-select:none;">
            <div>
              <h3 style="margin:0;">Factures PDF d’achat sur Google Drive</h3>
              <div class="hint" style="margin-top:4px;">${purchasePdfDriveFiles.length} fichier${purchasePdfDriveFiles.length > 1 ? 's' : ''} disponible${purchasePdfDriveFiles.length > 1 ? 's' : ''}, classé${purchasePdfDriveFiles.length > 1 ? 's' : ''} par année.</div>
            </div>
            <span aria-hidden="true" style="font-size:1.25rem;color:#64748b;">▾</span>
          </summary>

          <div style="padding-top:16px;margin-top:14px;border-top:1px solid #e2e8f0;">
            <div class="section-head" style="margin-bottom:0;">
              <div class="hint">Liste des PDF ajoutés depuis les lignes d’achat. Tu peux les consulter ou les supprimer.</div>
              <button type="button" onclick="loadPurchasePdfDriveFiles(true).then(() => render())">Actualiser</button>
            </div>
            ${renderPurchasePdfList()}
          </div>
        </details>
      </div>
    </section>
  `;
}

function renderInvestments() {
  const t = totals();
  return renderTablePage({
    key: 'investments',
    title: 'Investissements',
    hint: 'Les investissements sont encodés directement ici, sans passer par les achats.',
    addLabel: 'Ajouter un investissement',
    onAdd: `addRow('investments', { date: '', supplier: '', invoiceNumber: '', description: '', amount: 0, durationMonths: 60 })`,
    tableAttrs: `style="table-layout:fixed; width:100%;"`,
    colgroup: `
    <colgroup>
      <col style="width: 110px;">
      <col style="width: 110px;">
      <col style="width: 100px;">
      <col style="width: 180px;">
      <col style="width: 90px;">
      <col style="width: 75px;">
      <col style="width: 75px;">
      <col style="width: 75px;">
      <col style="width: 75px;">
      <col style="width: 75px;">
    </colgroup>
  `,
    headers: ['Date achat', 'Fournisseur', 'N° facture', 'Description', 'Montant HTVA', 'Durée (mois)', 'Amorti année', 'Amorti total', 'Valeur restante', ''],

    rows: t.investmentComputed.map((row, i) => `
      <tr>
  <tr>
  <td><input type="date" value="${escapeAttr(row.date)}" onchange="data.investments[${i}].date=this.value; saveData(false)"></td>

  <td><input value="${escapeAttr(data.investments[i].supplier || '')}" onchange="data.investments[${i}].supplier=this.value; saveData(false)"></td>

  <td><input value="${escapeAttr(data.investments[i].invoiceNumber || '')}" onchange="data.investments[${i}].invoiceNumber=this.value; saveData(false)"></td>

  <td><input value="${escapeAttr(data.investments[i].description || '')}" onchange="data.investments[${i}].description=this.value; saveData(false)"></td>

  <td><input type="number" step="0.01" value="${num(row.amount)}" onchange="data.investments[${i}].amount=parseFloat(this.value)||0; saveData(false)"></td>

  <td><input type="number" min="1" step="1" value="${parseInt(row.durationMonths || 60, 10)}" onchange="data.investments[${i}].durationMonths=parseInt(this.value,10)||1; saveData(false)"></td>

  <td>${money(row.amortYear)}</td>
  <td>${money(row.amortTotal)}</td>
  <td>${money(row.netValue)}</td>

  <td><button class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" onclick="deleteRow('investments', ${i})"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
</tr>
</tr>
    `).join('') || `<tr><td colspan="8">Aucun investissement encodé.</td></tr>`,
    footer: `
      <div class="kv"><span>Total investissements HTVA</span><span>${money(t.investmentComputed.reduce((sum, row) => sum + row.amount, 0))}</span></div>
      <div class="kv"><span>Total amortissements investissements de l'année</span><span>${money(t.investmentComputed.reduce((sum, row) => sum + row.amortYear, 0))}</span></div>
      <div class="kv"><span>Total amorti cumulé investissements</span><span>${money(t.investmentComputed.reduce((sum, row) => sum + row.amortTotal, 0))}</span></div>
    `
  });
}

function renderAssets() {
  const t = totals();
  return renderTablePage({
    key: 'assets',
    title: 'Immobilisations',
    hint: 'Encodage direct des investissements et immobilisations.',
    addLabel: 'Ajouter une immobilisation',
    onAdd: `addRow('assets', { date: '', supplier: '', invoiceNumber: '', description: '', label: '', amount: 0, durationMonths: 60 })`,
    headers: ['Date', 'Libellé', 'Fournisseur', 'Montant HTVA', 'Durée (mois)', 'Amorti année', 'Amorti total', 'Valeur nette', ''],
    rows: t.assetsComputed.map((row) => {
      const i = row.sourceIndex;

      return `
    <tr>
      <td>
        <input
          type="date"
          value="${escapeAttr(row.date)}"
          onchange="data.assets[${i}].date=this.value; saveData(false)"
        >
      </td>

      <td>
        <input
          value="${escapeAttr(row.label)}"
          onchange="data.assets[${i}].label=this.value; saveData(false)"
        >
      </td>

      <td>
        <input
          value="${escapeAttr(row.supplier)}"
          onchange="data.assets[${i}].supplier=this.value; saveData(false)"
        >
      </td>

      <td>
        <input
          type="number"
          step="0.01"
          value="${num(row.amount)}"
          onchange="data.assets[${i}].amount=parseFloat(this.value)||0; saveData(false)"
        >
      </td>

      <td>
        <input
          type="number"
          min="1"
          step="1"
          value="${parseInt(row.durationMonths || 60, 10)}"
          onchange="data.assets[${i}].durationMonths=parseInt(this.value,10)||1; saveData(false)"
        >
      </td>

      <td>${money(row.amortYear)}</td>
      <td>${money(row.amortTotal)}</td>
      <td>${money(row.netValue)}</td>

      <td>
        <button
          class="delete-icon-btn"
          title="Supprimer"
          aria-label="Supprimer"
          onclick="deleteRow('assets', ${i})"
        ><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
      </td>
    </tr>
  `;
    }).join('') || `<tr><td colspan="9">Aucune immobilisation encodée.</td></tr>`,
    footer: `
      <div class="kv"><span>Total immobilisations</span><span>${money(t.assetsComputed.reduce((sum, row) => sum + row.amount, 0))}</span></div>
<div class="kv"><span>Amortissement annuel</span><span>${money(t.assetsComputed.reduce((sum, row) => sum + row.amortYear, 0))}</span></div>
<div class="kv"><span>Amortissement cumulé</span><span>${money(t.assetsComputed.reduce((sum, row) => sum + row.amortTotal, 0))}</span></div>
<div class="kv"><span>Valeur nette</span><span>${money(t.assetsComputed.reduce((sum, row) => sum + row.netValue, 0))}</span></div>
    `
  });
}

function renderStock() {
  const t = totals();
  return renderTablePage({
    key: 'stock',
    title: 'Stock matériaux',
    hint: 'Le stock est valorisé en quantité x prix unitaire.',
    addLabel: 'Ajouter une ligne de stock',
    onAdd: `addRow('stock', { label: '', quantity: 0, unitPrice: 0 })`,
    headers: ['Libellé', 'Quantité', 'Prix unitaire', 'Valeur', ''],
    rows: data.stock.map((row, i) => `
          <tr>
            <td><input value="${escapeAttr(row.label)}" onchange="data.stock[${i}].label=this.value; saveData(false)"></td>
            <td><input type="number" step="0.01" value="${num(row.quantity)}" onchange="data.stock[${i}].quantity=parseFloat(this.value)||0; saveData(false)"></td>
            <td><input type="number" step="0.01" value="${num(row.unitPrice, 4)}" onchange="data.stock[${i}].unitPrice=parseFloat(this.value)||0; saveData(false)"></td>
            <td>${money(toNumber(row.quantity) * toNumber(row.unitPrice))}</td>
            <td><button class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" onclick="deleteRow('stock', ${i})"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
          </tr>
        `).join(''),
    footer: `<div class="kv"><span>Valeur totale du stock</span><span>${money(t.stockValue)}</span></div>`
  });
}

function renderLosses() {
  const t = totals();
  return renderTablePage({
    key: 'losses',
    title: 'Taxes et cotisations',
    hint: 'Cotisations sociales : gardent la mécanique d’exonération. Taxes sans TVA : reprises en 64. Frais financiers : repris en 65. Charges exceptionnelles : reprises en 66.',
    addLabel: 'Ajouter une ligne',
    onAdd: `addRow('losses', { date: '', type: 'cotisations_sociales', label: '', quantity: 1, unitPrice: 0 })`,
    headers: ['Date', 'Type', 'Libellé', 'Quantité', 'Montant unitaire', 'Total', ''],
    rows: data.losses.map((row, i) => `
          <tr>
            <td><input type="date" value="${escapeAttr(row.date)}" onchange="data.losses[${i}].date=this.value; saveData(false)"></td>
            <td>${renderLossTypeSelect(row, i)}</td>
            <td><input value="${escapeAttr(row.label)}" onchange="data.losses[${i}].label=this.value; saveData(false)"></td>
            <td><input type="number" step="0.01" value="${num(row.quantity)}" onchange="data.losses[${i}].quantity=parseFloat(this.value)||0; saveData(false)"></td>
            <td><input type="number" step="0.01" value="${num(row.unitPrice)}" onchange="data.losses[${i}].unitPrice=parseFloat(this.value)||0; saveData(false)"></td>
            <td>${money(toNumber(row.quantity) * toNumber(row.unitPrice))}</td>
            <td><button class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" onclick="deleteRow('losses', ${i})"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
          </tr>
        `).join(''),
    footer: `
      <div class="kv"><span>Cotisations sociales</span><span>${money(t.socialContributionsTotal)}</span></div>
      <div class="kv"><span>64 – Taxes sans TVA récupérable</span><span>${money(t.otherTaxesTotal)}</span></div>
      <div class="kv"><span>65 – Frais financiers / banque</span><span>${money(t.financialChargesTotal)}</span></div>
      <div class="kv"><span>66 – Charges exceptionnelles</span><span>${money(t.exceptionalChargesTotal)}</span></div>
      <div class="kv"><span>Total onglet</span><span>${money(t.lossesTotal)}</span></div>
    `
  });
}

function renderKm() {
  const t = totals();
  return renderTablePage({
    key: 'km',
    title: 'Kilomètres',
    addLabel: 'Ajouter un déplacement',
    onAdd: `addRow('km', { date: '', person: '', route: '', km: 0, trips: 1 })`,
    headers: ['Date', 'Personne', 'Trajet', 'Km', 'Nb déplacements', 'Km totaux', ''],
    rows: data.km.map((row, i) => `
          <tr>
            <td><input type="date" value="${escapeAttr(row.date)}" onchange="data.km[${i}].date=this.value; saveData(false)"></td>
            <td><input value="${escapeAttr(row.person)}" onchange="data.km[${i}].person=this.value; saveData(false)"></td>
            <td><input value="${escapeAttr(row.route)}" onchange="data.km[${i}].route=this.value; saveData(false)"></td>
            <td><input type="number" step="0.01" value="${num(row.km)}" onchange="data.km[${i}].km=parseFloat(this.value)||0; saveData(false)"></td>
            <td><input type="number" step="0.01" value="${num(row.trips)}" onchange="data.km[${i}].trips=parseFloat(this.value)||0; saveData(false)"></td>
            <td>${num(toNumber(row.km) * toNumber(row.trips), 2)} km</td>
            <td><button class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" onclick="deleteRow('km', ${i})"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
          </tr>
        `).join(''),
    footer: `<div class="kv"><span>Total kilomètres</span><span>${num(t.kmTotal, 2)} km</span></div>`
  });
}


function getPrivateMovementTypeLabel(type) {
  const labels = {
    withdrawal: 'Prélèvement privé',
    regularization: 'Régularisation',
    contribution: 'Apport privé',
    reimbursement: 'Remboursement privé'
  };
  return labels[type] || labels.withdrawal;
}

function updatePrivateMovementField(index, field, value) {
  const row = data.privateMovements?.[index];
  if (!row) return;

  const nextValue = field === 'amount' ? Math.abs(toNumber(value)) : value;
  if (row[field] === nextValue) return;

  row[field] = nextValue;
  notifyPortalBusinessChange("Prélèvement de l'exploitant modifié");
  saveData(false);
}

function renderPrivateMovementTypeSelect(row, index) {
  const current = row?.type || 'withdrawal';
  return `
    <select onchange="updatePrivateMovementField(${index}, 'type', this.value)">
      <option value="withdrawal" ${current === 'withdrawal' ? 'selected' : ''}>Prélèvement privé</option>
      <option value="regularization" ${current === 'regularization' ? 'selected' : ''}>Régularisation</option>
      <option value="contribution" ${current === 'contribution' ? 'selected' : ''}>Apport privé</option>
      <option value="reimbursement" ${current === 'reimbursement' ? 'selected' : ''}>Remboursement privé</option>
    </select>
  `;
}

function renderPrivateMovements() {
  const t = totals();
  const { withdrawals, regularizations, additions } = BastOperatingLedger.summarize({
    privateMovements: data.privateMovements
  });

  return renderTablePage({
    key: 'private',
    title: "Prélèvements de l'exploitant",
    hint: "Enregistre ici les prélèvements effectués par l'exploitant à titre privé ainsi que leurs éventuels remboursements ou apports. Ces mouvements n'affectent pas le compte de résultat et sont repris séparément au passif du bilan.",
    addLabel: 'Ajouter un mouvement',
    onAdd: `addRow('privateMovements', { date: '', type: 'withdrawal', label: '', amount: 0 })`,
    headers: ['Date', 'Type', 'Motif / justification', 'Montant', 'Effet au passif', ''],
    rows: data.privateMovements.map((row, i) => {
      const amount = Math.abs(toNumber(row.amount));
      const effect = BastOperatingLedger.privateMovementEffect(row);
      return `
        <tr>
          <td><input type="date" value="${escapeAttr(row.date || '')}" onchange="updatePrivateMovementField(${i}, 'date', this.value)"></td>
          <td>${renderPrivateMovementTypeSelect(row, i)}</td>
          <td><input value="${escapeAttr(row.label || '')}" placeholder="Ex. retrait personnel, remboursement d'une erreur..." onchange="updatePrivateMovementField(${i}, 'label', this.value)"></td>
          <td><input type="number" min="0" step="0.01" value="${num(amount)}" onchange="updatePrivateMovementField(${i}, 'amount', this.value)"></td>
          <td class="${effect < 0 ? 'status-bad' : 'status-good'}">${money(effect)}</td>
          <td><button class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" onclick="deleteRow('privateMovements', ${i})"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></td>
        </tr>
      `;
    }).join(''),
    footer: `
      <div class="kv"><span>Prélèvements privés de l'exercice</span><span>${money(withdrawals)}</span></div>
      <div class="kv"><span>Régularisations historiques</span><span>${money(regularizations)}</span></div>
      <div class="kv"><span>Apports / remboursements privés de l'exercice</span><span>${money(additions)}</span></div>
      <div class="kv"><span>Solde compte exploitant reporté</span><span>${money(t.ownerAccountCarryover)}</span></div>
      <div class="kv"><span><strong>Prélèvements de l'exploitant au passif</strong></span><span><strong>${money(t.ownerAccountBalance)}</strong></span></div>
    `
  });
}

function renderResult() {
  const t = totals();
  const taxAndSocial = t.deductibleSocialContributions;
  const excessSocialRefund = t.excessSocialRefund;
  const exemptionThreshold = toNumber(data.settings.socialExemptionThreshold || 1881.76);
  const contributionRate = toNumber(data.settings.socialContributionRate || 20.5);
  const contributionFeeRate = toNumber(data.settings.socialContributionFeeRate || 3.5);
  const isExemptSocial = t.estimatedProfit <= exemptionThreshold;
  const socialTotalContribution = t.socialContributionDue;
  const socialStatusLabel = isExemptSocial
    ? `Exonéré de cotisations sociales (≤ ${money(exemptionThreshold)})`
    : `Non exonéré de cotisations sociales (> ${money(exemptionThreshold)})`;
  const hasExcessSocialRefund = excessSocialRefund > 0;
  const socialDetailLabel = hasExcessSocialRefund
    ? 'Information uniquement — remboursement à traiter l’année de sa perception'
    : isExemptSocial
      ? 'Cotisations sociales récupérées'
      : `Cotisations sociales (${num(contributionRate, 1)}%) + frais caisse (${num(contributionFeeRate, 1)}%)`;

  return `
        <section class="page ${activePage === 'result' ? 'active' : ''}">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Compte de résultat</h2>
              </div>
            </div>

            <div style="overflow:auto;">
              <table>
                <thead>
                  <tr>
                    <th style="width:40%; text-align:center;">Produits professionnels</th>
                    <th style="width:42%; text-align:center;">Dépenses &amp; Frais</th>
                    <th style="width:18%; text-align:center;">Valeurs</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                   <td style="background:#dcfce7; font-weight:700; font-size:22px;">${money(t.salesNet)}</td>
                   <td>60 – Marchandises</td>
                   <td style="text-align:right;">${money(t.purchasesMerchandiseNet)}</td>
                  </tr>

                  <tr>
                    <td rowspan="7" style="background:${excessSocialRefund > 0 ? '#ecfdf5' : '#f8fafc'};${excessSocialRefund > 0 ? ' font-weight:700;' : ''}">${excessSocialRefund > 0 ? `Excédent remboursement cotisations : ${money(excessSocialRefund)}` : ''}</td>
                    <td>61 – Frais de fonctionnement / Frais généraux</td>
                    <td style="text-align:right;">${money(t.purchasesGeneralNet)}</td>
                  </tr>
                  <tr>
                    <td>62 – Rémunérations</td>
                    <td style="text-align:right;">${money(0)}</td>
                  </tr>
                  <tr>
                    <td>63 – Amortissements</td>
                    <td style="text-align:right;">${money(t.yearlyAmort)}</td>
                  </tr>
                  <tr>
                    <td>64 – Taxes sans TVA récupérable</td>
                    <td style="text-align:right;">${money(t.otherTaxesTotal)}</td>
                  </tr>
                  <tr>
                    <td>65 – Frais financiers / banque</td>
                    <td style="text-align:right;">${money(t.financialChargesTotal)}</td>
                  </tr>
                  <tr>
                    <td>66 – Charges exceptionnelles</td>
                    <td style="text-align:right;">${money(t.exceptionalChargesTotal)}</td>
                  </tr>
                  <tr style="background:#f1f5f9; font-weight:700;">
                    <td style="text-align:right;">Total :</td>
                    <td style="text-align:right;">${money(
    t.purchasesMerchandiseNet + t.purchasesGeneralNet + t.yearlyAmort
    + t.otherTaxesTotal + t.financialChargesTotal + t.exceptionalChargesTotal
  )}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style="max-width:560px; margin:18px 0 0 auto; display:grid; gap:10px;">
              <div style="display:grid; grid-template-columns: 1fr 180px; border:1px solid var(--line);">
                <div style="padding:10px 12px; background:#e2e8f0; font-weight:700; text-align:right;">TOTAUX :</div>
                <div style="padding:10px 12px; background:#fef08a; font-weight:700; text-align:right;">${money(t.estimatedProfit)}</div>
              </div>
              <div style="display:grid; grid-template-columns: 1fr 180px; border:1px solid var(--line);">
                <div style="padding:10px 12px; text-align:center;">
                  ${socialStatusLabel}<br>
                  <span style="color:var(--muted); font-size:13px;">${socialDetailLabel}</span>
                </div>
                <div style="padding:10px 12px; text-align:right;">
                  ${hasExcessSocialRefund
      ? `+ ${money(excessSocialRefund)}`
      : `${isExemptSocial ? '+' : '-'} ${money(isExemptSocial ? taxAndSocial : socialTotalContribution)}`}
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
}

function renderBalance() {
  const t = totals();
  return `
        <section class="page two-cols ${activePage === 'balance' ? 'active' : ''}">
          <div class="card">
            <div class="section-head"><h2>Bilan simplifié</h2></div>
            <div class="kv"><span>Immobilisations nettes</span><span>${money(t.netFixedAssets)}</span></div>
            <div class="kv"><span>Stock</span><span>${money(t.stockValue)}</span></div>
            <div class="kv"><span>TVA à recevoir</span><span>${money(t.receivableVat)}</span></div>
            <div class="kv"><span>Banque + caisse</span><span>${money(t.liquidities)}</span></div>
            <div class="kv"><span><strong>Total actif</strong></span><span><strong>${money(t.assetsSide)}</strong></span></div>
          </div>
          <div class="card">
            <div class="section-head"><h3>Passif simplifié</h3></div>
            <div class="kv"><span>Capital de départ</span><span>${money(data.settings.capitalStart)}</span></div>
            <div class="kv"><span>Résultat reporté</span><span>${money(data.settings.retainedEarnings)}</span></div>
            <div class="kv"><span>Prélèvements de l'exploitant</span><span>${money(t.ownerAccountBalance)}</span></div>
            <div class="kv"><span>Résultat de l'exercice</span><span>${money(t.estimatedProfit)}</span></div>
            <div class="kv"><span>TVA à payer</span><span>${money(t.payableVat)}</span></div>
            <div class="kv"><span><strong>Total passif</strong></span><span><strong>${money(t.liabilitiesSide)}</strong></span></div>
            <div class="kv"><span>Écart</span><span class="${Math.abs(t.assetsSide - t.liabilitiesSide) < 0.01 ? 'status-good' : 'status-bad'}">${money(t.assetsSide - t.liabilitiesSide)}</span></div>
          </div>
        </section>
      `;
}


function renderVat() {
  ensureVatStructures();
  if (isVatExempt()) {
    return BastVatUi.exemptPage(activePage === 'vat');
  }
  const vatLedger = computeVatLedger();

  return `
        <section class="page ${activePage === 'vat' ? 'active' : ''}">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Suivi TVA</h2>
                <div class="hint">Les 4 trimestres de l’année affichée sont générés automatiquement. Les dates de début et fin s’adaptent au bon nombre de jours du mois. Une période clôturée devient verrouillée.</div>
              </div>
              <div class="inline-actions">
                <button type="button" onclick="openIntervat()">Intervat</button>
              </div>
            </div>

            ${BastVatUi.overview({ ...vatLedger, initialCredit: data.settings.vatCarryover }, money)}

            <div class="muted-box" style="margin-bottom:16px;">
              <strong>Grilles principales :</strong><br>
              01 / 02 / 03 / 54 / 59 / 71 / 72 sont affichées en priorité.<br>
              Les autres codes Intervat restent disponibles sous <strong>Plus de codes</strong> pour les cas particuliers.<br>
              Le bouton <strong>Intervat</strong> ouvre directement le portail officiel de déclaration.
            </div>

            ${vatLedger.rows.map((row, i) => {
    const dec = row.declaration;
    const c = row.computed;
    const isExpanded = expandedVatDeclarationId === dec.id;
    const { isClosed, disableAttr, netLabel, netLabelClass, dueDateLabel, statusBadge, paymentBadge, situationText } = BastVatUi.declarationView(row, {
      money, date: printableDate, situation: getVatSituationText
    });
    return `
                <div class="card vat-declaration-card compact">
                  <div class="vat-summary-header" onclick="toggleVatDeclarationExpanded('${escapeAttr(dec.id)}')">
                    <div class="vat-summary-main">
                      <div class="vat-summary-title">${escapeHtml(quarterLabel(dec.year, dec.quarter))}</div>
                      <div class="hint">Période : ${printableDate(c.startDate)} au ${printableDate(c.endDate)} · Échéance : ${dueDateLabel}</div>
                      <div class="hint"><strong>${escapeHtml(situationText)}</strong></div>
                      <div class="vat-summary-badges">
                        ${statusBadge}
                        ${paymentBadge}
                        <span class="vat-pill muted">${c.salesCount} vente(s)</span>
                        <span class="vat-pill muted">${c.purchaseCount} achat(s)</span>
                      </div>
                    </div>
                    <div class="vat-summary-amount ${netLabelClass}">${netLabel}</div>
                  </div>

                  ${BastVatUi.miniSummary(c.boxes, money)}

                  ${isExpanded ? `
                    <div class="vat-expanded-panel">
                      <div class="grid-2">
                        ${BastVatUi.declarationForm(dec, i, { attr: escapeAttr, num })}
                        ${BastVatUi.calculationSummary(row, money)}
                      </div>

                      ${BastVatUi.primaryCodes(c.boxes, money)}

                      ${BastVatUi.extraCodes(dec, c, i, { num, attr: escapeAttr, money })}

                      <div style="margin-top:16px;">
                        <label style="display:block; font-weight:700; margin-bottom:8px;">Notes TVA / Intervat</label>
                        <textarea ${disableAttr} onchange="data.vat.declarations[${i}].notes=this.value; saveData(false)">${escapeHtml(dec.notes || '')}</textarea>
                      </div>

                      <div class="inline-actions" style="margin-top:16px;">
                        <button class="delete-icon-btn" title="Supprimer" aria-label="Supprimer" ${disableAttr} onclick="deleteVatDeclaration(${i})"><svg class="trash-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
  }).join('') || `<div class="muted-box">Aucune période TVA.</div>`}
          </div>
        </section>
      `;
}

function renderSettings() {
  return `
        <section class="page two-cols ${activePage === 'settings' ? 'active' : ''}">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Paramètres</h2>
                <div class="hint">Uniquement les réglages encore utiles au calcul.</div>
              </div>
            </div>
            <table>
              <tbody>
                <tr><td>Nom de l'entreprise</td><td><input value="${escapeAttr(data.company.name)}" onchange="setField('company.name', this.value)"></td></tr>
                <tr><td>Période</td><td><input value="${escapeAttr(data.company.period)}" onchange="setField('company.period', this.value)"></td></tr>
                <tr>
                  <td>Régime TVA</td>
                  <td>
                    <select onchange="setVatRegime(this.value)">
                      <option value="taxable" ${getVatRegime() === 'taxable' ? 'selected' : ''}>Assujetti TVA</option>
                      <option value="mixed" ${getVatRegime() === 'mixed' ? 'selected' : ''}>Assujetti mixte</option>
                      <option value="exempt_article_44" ${getVatRegime() === 'exempt_article_44' ? 'selected' : ''}>Exonéré TVA – article 44 (ex. infirmier)</option>
                    </select>
                    <div class="hint" style="margin-top:6px;">Ce choix adapte les ventes, la récupération de TVA sur les achats, les charges et l’onglet TVA.</div>
                  </td>
                </tr>
                <tr><td>Report TVA</td><td><input type="number" step="0.01" value="${num(data.settings.vatCarryover)}" ${isVatExempt() ? 'disabled title="Sans objet pour une activité exonérée article 44"' : ''} onchange="setField('settings.vatCarryover', parseFloat(this.value)||0)"></td></tr>
                <tr><td>Seuil exonération cotisations sociales</td><td><input type="number" step="0.01" value="${num(data.settings.socialExemptionThreshold)}" onchange="setField('settings.socialExemptionThreshold', parseFloat(this.value)||1881.76)"></td></tr>
                <tr><td>Taux cotisations sociales (%)</td><td><input type="number" step="0.01" value="${num(data.settings.socialContributionRate)}" onchange="setField('settings.socialContributionRate', parseFloat(this.value)||20.5)"></td></tr>
                <tr><td>Frais caisse sociale (%)</td><td><input type="number" step="0.01" value="${num(data.settings.socialContributionFeeRate)}" onchange="setField('settings.socialContributionFeeRate', parseFloat(this.value)||3.5)"></td></tr>
                <tr><td>Banque</td><td><input type="number" step="0.01" value="${num(data.settings.bankBalance)}" onchange="setField('settings.bankBalance', parseFloat(this.value)||0)"></td></tr>
                <tr><td>Caisse</td><td><input type="number" step="0.01" value="${num(data.settings.cashBalance)}" onchange="setField('settings.cashBalance', parseFloat(this.value)||0)"></td></tr>
                <tr><td>Capital de départ</td><td><input type="number" step="0.01" value="${num(data.settings.capitalStart)}" onchange="setField('settings.capitalStart', parseFloat(this.value)||0)"></td></tr>
                <tr><td>Résultat reporté</td><td><input type="number" step="0.01" value="${num(data.settings.retainedEarnings)}" onchange="setField('settings.retainedEarnings', parseFloat(this.value)||0)"></td></tr>
                <tr><td>Prélèvements de l'exploitant reportés</td><td><input type="number" step="0.01" value="${num(data.settings.ownerAccountCarryover)}" onchange="setField('settings.ownerAccountCarryover', parseFloat(this.value)||0)"><div class="hint" style="margin-top:6px;">Solde repris d'un exercice précédent. Les mouvements de l'année se saisissent dans l'onglet Prélèvements de l'exploitant.</div></td></tr>
              </tbody>
            </table>
          </div>
          <div class="card">
            <div class="section-head"><h3>Notes internes</h3></div>
            <textarea onchange="setField('company.notes', this.value)">${escapeHtml(data.company.notes || '')}</textarea>
            <div class="footer-note">Tu peux t'en servir pour noter des rappels comptables ou des points à vérifier.</div>

            <div class="section-head" style="margin-top:20px;">
              <div>
                <h3>Exercice suivant</h3>
                <div class="hint">Crée un nouveau fichier JSON pour l'année suivante en reprenant le stock, les immobilisations, les investissements, les paramètres et le résultat reporté. Tu choisis ensuite un téléchargement sur PC ou un envoi direct sur Drive.</div>
              </div>
            </div>
            <div class="inline-actions">
              <button type="button" onclick="createNextExerciseFile()">Créer l'exercice suivant</button>
            </div>
          </div>
        </section>
      `;
}

function renderTablePage({ key, title, hint, addLabel, onAdd, headers, rows, footer, tableAttrs = '', colgroup = '' }) {
  const hasHint = Boolean(hint && hint.trim());
  const hasButton = Boolean(addLabel && addLabel.trim() && onAdd && onAdd.trim());

  return `
    <section class="page ${activePage === key ? 'active' : ''}">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>${title}</h2>
            ${hasHint ? `<div class="hint">${hint}</div>` : ``}
          </div>
          ${hasButton ? `
            <div class="inline-actions">
              <button class="primary" onclick="${onAdd}">${addLabel}</button>
            </div>
          ` : ``}
        </div>
        <div style="overflow:auto;">
          <table ${tableAttrs}>
            ${colgroup}
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows || `<tr><td colspan="${headers.length}">Aucune ligne.</td></tr>`}</tbody>
          </table>
        </div>
        <div style="margin-top: 14px;">${footer || ''}</div>
      </div>
    </section>
  `;
}

function escapeHtml(str) {
  return BastFormatters.escapeHtml(str);
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, '&#096;');
}


function printableDate(value) {
  return BastAccountingReportTemplate.date(value, escapeHtml);
}

function buildPrintReportHtml() {
  const t = totals();
  const year = parseInt(data.company.period, 10) || new Date().getFullYear();
  const excessSocialRefund = t.excessSocialRefund;
  const vatLedger = computeVatLedger();
  const reportData = BastAccountingReportData.build({
    data,
    summary: t,
    vatLedger,
    vatExempt: isVatExempt(),
    purchaseVatAt: purchaseVatDisplay,
    format: {
      date: printableDate,
      escape: escapeHtml,
      money,
      num,
      quarter: quarterLabel,
      lossTypeLabel: getLossTypeLabel,
      privateMovementTypeLabel: getPrivateMovementTypeLabel
    }
  });
  const {
    vatRows: vatReportRows,
    salesRows,
    purchaseRows,
    investmentRows,
    assetRows,
    stockRows,
    lossRows,
    privateMovementRows,
    kmRows,
    exemptionThreshold,
    isExemptSocial,
    socialTotalContribution
  } = reportData;

  return BastAccountingReportTemplate.documentStart({
    title: `Export comptabilité ${escapeHtml(data.company.period || '')}`,
    companyName: escapeHtml(data.company.name || 'Entreprise'),
    period: escapeHtml(data.company.period || '—'),
    generatedAt: new Intl.DateTimeFormat('fr-BE', { dateStyle: 'full', timeStyle: 'short' }).format(new Date()),
    purchaseCount: data.purchases.length,
    salesCount: data.sales.length,
    metrics: [
      ['Ventes HTVA', money(t.salesNet)],
      ['Achats HTVA', money(t.purchasesNet)],
      ...(!isVatExempt() ? [['TVA nette', money(t.netVat)]] : []),
      ['Résultat estimé', money(t.estimatedProfit)]
    ]
  }) + `

    ${BastAccountingReportTemplate.keyValueGridSection("Vue d'ensemble", [
    ['Société', escapeHtml(data.company.name || '—')],
    ['Période', escapeHtml(data.company.period || '—')],
    ['Régime TVA', escapeHtml(getVatRegimeLabel())],
    ['Investissements', String(t.investmentComputed.length)],
    ['Immobilisations', String(data.assets.length)],
    ['Km encodés', `${num(t.kmTotal, 0)} km`],
    ["Prélèvements de l'exploitant", money(t.ownerAccountBalance)],
    ['Stock estimé', money(t.stockValue)]
  ], [
    ['TVA ventes', money(t.salesVat)],
    ['TVA achats récupérable', money(t.purchasesVat)],
    ['Report TVA', money(data.settings.vatCarryover)],
    ['Actif simplifié', money(t.assetsSide)],
    ['Passif simplifié', money(t.liabilitiesSide)],
    ['Écart bilan', money(t.assetsSide - t.liabilitiesSide)]
  ], { soft: true })}

    ${BastAccountingReportTemplate.tableSection('Ventes', ['Date', 'Client', 'N° facture', 'Description', 'Taux TVA', 'HTVA', 'TVA', 'TVAC'], salesRows, {}, [
    ['Total ventes HTVA', money(t.salesNet)],
    ['Total TVA ventes', money(t.salesVat)]
  ])}

    ${BastAccountingReportTemplate.tableSection('Achats', ['Date', 'Fournisseur', 'N° facture', 'Type', 'Taux TVA', 'HTVA', 'TVA déductible', 'TVA récup.', 'TVAC'], purchaseRows, { compact: true }, [
    ['Total achats en charges', money(t.purchasesNet)],
    ['Dont frais généraux', money(t.purchasesGeneralNet)],
    ['Dont marchandises', money(t.purchasesMerchandiseNet)],
    ['Total TVA récupérable', money(t.purchasesVat)]
  ])}

    ${BastAccountingReportTemplate.tableSection('Investissements', ['Date achat', 'Fournisseur', 'N° facture', 'Description', 'Montant HTVA', 'Durée', 'Amorti année', 'Amorti total', 'Valeur restante'], investmentRows, { compact: true })}

    ${BastAccountingReportTemplate.tableSection('Immobilisations', ['Date', 'Libellé', 'Fournisseur', 'Montant HTVA', 'Durée', 'Amorti année', 'Amorti total', 'Valeur nette'], assetRows, { compact: true })}

    ${BastAccountingReportTemplate.tableSection('Stock matériaux', ['Libellé', 'Quantité', 'Prix unitaire', 'Valeur'], stockRows)}

    ${BastAccountingReportTemplate.tableSection('Taxes et cotisations', ['Date', 'Type', 'Libellé', 'Quantité', 'Montant unitaire', 'Total'], lossRows)}

    ${BastAccountingReportTemplate.tableSection('Kilomètres', ['Date', 'Personne', 'Trajet', 'Km', 'Nb déplacements', 'Km totaux'], kmRows)}

    ${BastAccountingReportTemplate.tableSection("Prélèvements de l'exploitant", ['Date', 'Type', 'Motif / justification', 'Montant', 'Effet au passif'], privateMovementRows, {}, [
        ['Solde compte exploitant reporté', money(t.ownerAccountCarryover)],
        ["Mouvements de l'exploitant nets de l’exercice", money(t.privateMovementsNet)],
        ["Prélèvements de l'exploitant au passif", money(t.ownerAccountBalance)]
      ])}

    ${BastAccountingReportTemplate.resultSection([
      { label: 'Recettes des ventes', value: money(t.salesNet) },
      ...(excessSocialRefund > 0 ? [{ label: 'Excédent remboursement cotisations sociales', value: money(excessSocialRefund) }] : []),
      { label: '60 – Marchandises', value: money(t.purchasesMerchandiseNet) },
      { label: '61 – Frais généraux', value: money(t.purchasesGeneralNet) },
      { label: '63 – Amortissements', value: money(t.yearlyAmort) },
      { label: '64 – Taxes sans TVA récupérable', value: money(t.otherTaxesTotal) },
      { label: 'Cotisations sociales versées', value: money(t.socialContributionsTotal) },
      { label: 'Résultat estimé', value: money(t.estimatedProfit), total: true }
    ], [
    ['Exercice', String(year)],
    ['Seuil exonération sociale', money(exemptionThreshold)],
    ['Cotisations sociales estimées', money(socialTotalContribution)],
    ['Excédent remboursement (information)', money(excessSocialRefund)],
    ['Statut social', escapeHtml(isExemptSocial ? 'Exonéré' : 'Non exonéré')]
  ])}

    ${BastAccountingReportTemplate.keyValueGridSection('Bilan simplifié', [
    ['Immobilisations nettes', money(t.netFixedAssets)],
    ['Stock', money(t.stockValue)],
    ['TVA à recevoir', money(t.receivableVat)],
    ['Banque + caisse', money(t.liquidities)],
    ['Total actif', money(t.assetsSide)]
  ], [
    ['Capital de départ', money(data.settings.capitalStart)],
    ['Résultat reporté', money(data.settings.retainedEarnings)],
    ["Prélèvements de l'exploitant", money(t.ownerAccountBalance)],
    ['Résultat de l’exercice', money(t.estimatedProfit)],
    ['TVA à payer', money(t.payableVat)],
    ['Total passif', money(t.liabilitiesSide)]
  ])}

    ${BastAccountingReportTemplate.keyValueGridSection('Suivi TVA',
      vatReportRows.length ? vatReportRows : [['Aucune période TVA', '—']], [
    ['Report TVA initial', money(data.settings.vatCarryover)],
    ['TVA déclarée non payée', money(vatLedger.totalFiledUnpaid)],
    ['TVA non déclarée nette', money(vatLedger.totalUnfiledDue - vatLedger.totalUnfiledCredit)],
    ['Solde TVA ouvert', money(vatLedger.totalDueOpen)]
  ])}

    ${BastAccountingReportTemplate.keyValueGridSection('Paramètres', [
    ['Nom de l’entreprise', escapeHtml(data.company.name || '—')],
    ['Période', escapeHtml(data.company.period || '—')],
    ['Report TVA', money(data.settings.vatCarryover)],
    ['Banque', money(data.settings.bankBalance)],
    ['Caisse', money(data.settings.cashBalance)],
    ['Capital de départ', money(data.settings.capitalStart)],
    ['Résultat reporté', money(data.settings.retainedEarnings)],
    ["Prélèvements de l'exploitant reportés", money(data.settings.ownerAccountCarryover)]
  ], [
    ['Seuil exonération cotisations sociales', money(data.settings.socialExemptionThreshold)],
    ['Taux cotisations sociales', `${num(data.settings.socialContributionRate)} %`],
    ['Frais caisse sociale', `${num(data.settings.socialContributionFeeRate)} %`],
    ['Notes', escapeHtml((data.company.notes || '').trim() || '—')]
  ])}

  ` + BastAccountingReportTemplate.documentEnd();
}

function openPrintReport() {
  saveData(false);
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    alert('Le navigateur a bloqué l’ouverture de la fenêtre d’impression. Autorise les pop-ups puis réessaie.');
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(buildPrintReportHtml());
  reportWindow.document.close();
  reportWindow.focus();
}

function render() {
  ensureVatStructures();
  const t = totals();

  renderTabs();
  renderPages();

  const metricSales = document.getElementById('metricSales');
  const metricPurchases = document.getElementById('metricPurchases');
  const metricVat = document.getElementById('metricVat');
  const metricProfit = document.getElementById('metricProfit');
  const metricVatCard = document.getElementById('metricVatCard');
  const intervatTopButton = document.getElementById('intervatTopButton');

  if (metricSales) metricSales.textContent = money(t.salesNet);
  if (metricPurchases) metricPurchases.textContent = money(t.purchasesNet);
  if (metricVatCard) metricVatCard.style.display = isVatExempt() ? 'none' : '';
  if (intervatTopButton) intervatTopButton.style.display = isVatExempt() ? 'none' : '';
  if (metricVat && !isVatExempt()) {
    if (t.payableVat > 0) {
      metricVat.previousElementSibling.textContent = 'TVA à payer';
      metricVat.textContent = money(t.payableVat);
    } else if (t.receivableVat > 0) {
      metricVat.previousElementSibling.textContent = 'TVA à recevoir';
      metricVat.textContent = money(t.receivableVat);
    } else {
      metricVat.previousElementSibling.textContent = 'TVA';
      metricVat.textContent = money(0);
    }
  }
  if (metricProfit) metricProfit.textContent = money(t.estimatedProfit);
}


function getInvoiceImportTypeLabel(row) {
  return BastSalesImport.typeLabel(row);
}

async function importInvoiceSalesRowsFromPortal(payloadOrRows) {
  const plan = BastSalesImport.prepare(payloadOrRows);
  const { action, incomingRows, invoiceNumbers } = plan;

  if (!invoiceNumbers.length) {
    return { ok: false, count: 0, message: 'Aucun numéro de facture valide à traiter.' };
  }

  const existingRows = BastSalesImport.matchingRows(data.sales, invoiceNumbers);
  const lockedExisting = existingRows.find(row => getClosedVatDeclarationForDate(row.date || ''));
  if (lockedExisting) {
    const dec = getClosedVatDeclarationForDate(lockedExisting.date || '');
    return { ok: false, count: 0, message: getVatLockMessage(dec) };
  }

  if (action === 'cancel') {
    const result = BastSalesImport.apply(data.sales, plan);
    data.sales = result.sales;
    activePage = 'sales';
    await saveData(false);
    if (googleAccessToken) await saveCurrentYearJsonToDrive(false);
    render();

    return {
      ok: true,
      count: result.count,
      message: result.message
    };
  }

  if (!incomingRows.length) {
    return { ok: false, count: 0, message: 'Aucune donnée de facture valide à importer.' };
  }

  const lockedIncoming = incomingRows.find(row => getClosedVatDeclarationForDate(row.date || ''));
  if (lockedIncoming) {
    const dec = getClosedVatDeclarationForDate(lockedIncoming.date || '');
    return { ok: false, count: 0, message: getVatLockMessage(dec) };
  }

  const result = BastSalesImport.apply(data.sales, plan);
  data.sales = result.sales;
  activePage = 'sales';
  await saveData(false);
  if (googleAccessToken) await saveCurrentYearJsonToDrive(false);
  render();

  return {
    ok: true,
    count: result.count,
    message: result.message
  };
}

window.importInvoiceSalesRowsFromPortal = importInvoiceSalesRowsFromPortal;

document.addEventListener('click', (event) => {
  if (!event.target.closest('.dropdown')) {
    closeFileMenu();
  }
});

async function saveFromPortalGlobal(options = {}) {
  const interceptedAlerts = [];
  const originalAlert = window.alert;
  if (options?.silent) {
    window.alert = message => {
      interceptedAlerts.push(String(message || ''));
      console.info('Alerte Comptabilité interceptée pendant la sauvegarde globale:', message);
    };
  }

  try {
    ensureVatStructures();
    ensurePurchaseRowIds();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    const chantierSynced = await syncPurchasesToChantiers(false);
    let driveSynced = false;
    let driveError = '';

    if (googleAccessToken) {
      try {
        driveSynced = await saveCurrentYearJsonToDrive(false);
      } catch (error) {
        driveError = error?.message || String(error);
        console.error('Sauvegarde Drive Comptabilité impossible.', error);
      }
    }

    render();
    return {
      ok: true,
      module: 'comptabilite',
      local: true,
      drive: !!googleAccessToken && driveSynced,
      chantierSynced,
      alertsIntercepted: interceptedAlerts.length,
      warnings: [driveError && `Drive sync: ${driveError}`].filter(Boolean)
    };
  } finally {
    if (options?.silent) window.alert = originalAlert;
  }
}

window.BastComptaModule = {
  name: 'Comptabilité',
  save: saveFromPortalGlobal,
  saveData,
  getChangeSnapshot: () => data,
  getStatus: () => ({ ready: true, module: 'comptabilite' })
};


window.addEventListener('load', async () => {
  ensureVatStructures();
  applyVatRegimeRules();
  render();
  await initDriveClientOnly();

  try {
    window.parent.postMessage({
      type: 'BASTCOMPTA_DRIVE_STATUS_REQUEST'
    }, window.location.origin);
  } catch (error) {
    console.error('Impossible de demander le statut Drive au portail.', error);
  }
});

// Navigation reçue depuis le menu latéral du portail.
window.addEventListener('message', event => {
  if (window.location.origin && window.location.origin !== 'null' && event.origin !== window.location.origin) return;
  const message = event.data || {};
  if (message.type === 'BASTCOMPTA_SET_ACTIVE_PAGE' && pageDefs.some(page => page.key === message.pageKey)) {
    activePage = message.pageKey;
    render();
  }
});
