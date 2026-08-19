/* BastCompta - accès Google Drive des factures PDF d'achat. */
(function (global) {
  'use strict';

  const LIST_OPTIONS = Object.freeze({
    spaces: 'appDataFolder',
    q: "mimeType='application/pdf' and trashed=false and name contains 'achat-'",
    orderBy: 'modifiedTime desc',
    pageSize: 100,
    fields: 'files(id, name, modifiedTime, size)'
  });

  function sanitizeNamePart(value, fallback = 'sans-reference') {
    const cleaned = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    return cleaned || fallback;
  }

  function fileName(row = {}, originalName = 'facture.pdf') {
    const invoice = sanitizeNamePart(row.invoiceNumber, 'sans-numero');
    const supplier = sanitizeNamePart(row.supplier, 'fournisseur');
    const date = sanitizeNamePart(row.date, 'sans-date');
    const original = sanitizeNamePart(String(originalName || 'facture.pdf').replace(/\.pdf$/i, ''), 'document');
    return `achat-${date}-${supplier}-${invoice}-${original}.pdf`;
  }

  async function list(listFiles, showAlert401 = false) {
    const response = await listFiles({ ...LIST_OPTIONS }, showAlert401);
    return response ? (response.result?.files || []) : null;
  }

  async function upload({ row = {}, file, accessToken, fetchDrive }) {
    const metadata = { name: fileName(row, file?.name), parents: ['appDataFolder'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);
    const response = await fetchDrive(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size',
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
    );
    if (!response) return null;
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function download({ fileId, accessToken, fetchDrive }) {
    const response = await fetchDrive(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response) return null;
    if (!response.ok) throw new Error(await response.text());
    return response.blob();
  }

  async function remove({ fileId, accessToken, fetchDrive }) {
    const response = await fetchDrive(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response) return false;
    if (!response.ok) throw new Error(await response.text());
    return true;
  }

  function unlinkPurchases(purchases = [], fileId) {
    let changed = 0;
    purchases.forEach(row => {
      if (row.pdfFileId !== fileId) return;
      row.pdfFileId = '';
      row.pdfFileName = '';
      row.pdfModifiedTime = '';
      changed += 1;
    });
    return changed;
  }

  function year(file = {}) {
    const match = String(file.name || '').match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
    if (match) return match[1];
    if (file.modifiedTime) {
      const modifiedDate = new Date(file.modifiedTime);
      if (!Number.isNaN(modifiedDate.getTime())) return String(modifiedDate.getFullYear());
    }
    return 'Sans année';
  }

  global.BastPurchasePdfDrive = Object.freeze({
    LIST_OPTIONS, sanitizeNamePart, fileName, list, upload, download, remove, unlinkPurchases, year
  });
})(globalThis);
