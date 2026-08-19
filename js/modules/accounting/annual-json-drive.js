/* BastCompta - service Google Drive des fichiers JSON comptables annuels. */
(function (global) {
  'use strict';

  const HIDDEN_NAMES = Object.freeze(['bastcompta-comptabilite-sync.json']);
  const LIST_OPTIONS = Object.freeze({
    spaces: 'appDataFolder',
    q: "mimeType='application/json' and trashed=false and name contains 'comptabilite-'",
    orderBy: 'modifiedTime desc',
    pageSize: 100,
    fields: 'files(id, name, modifiedTime)'
  });
  const visibleFiles = files => (files || []).filter(file => !HIDDEN_NAMES.includes(String(file.name || '')));

  async function list(listFiles) {
    const response = await listFiles({ ...LIST_OPTIONS });
    return response ? visibleFiles(response.result?.files || []) : null;
  }

  async function listYear(listFiles, year) {
    const response = await listFiles({
      spaces: 'appDataFolder',
      q: `mimeType='application/json' and trashed=false and name contains 'comptabilite-' and name contains '${year}'`,
      orderBy: 'modifiedTime desc', pageSize: 20, fields: 'files(id, name, modifiedTime)'
    });
    return response ? visibleFiles(response.result?.files || []).filter(file => String(file.name || '').endsWith('.json')) : null;
  }

  function selectYearFile(files = [], year) {
    const exact = files.filter(file => new RegExp(`(^|-)${year}\\.json$`).test(String(file.name || '')));
    return exact[0] || files[0] || null;
  }

  async function findByName({ fileName, listFiles, escapeQuery }) {
    const response = await listFiles({
      spaces: 'appDataFolder',
      q: `name='${escapeQuery(fileName)}' and trashed=false`,
      orderBy: 'modifiedTime desc',
      pageSize: 1,
      fields: 'files(id, name, modifiedTime)'
    });
    return response ? (response.result?.files || [])[0] || null : undefined;
  }

  async function upload({ sourceData, fileName, fileId = '', accessToken, fetchDrive }) {
    const metadata = fileId ? { name: fileName } : { name: fileName, parents: ['appDataFolder'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(sourceData, null, 2)], { type: 'application/json' }));
    const base = 'https://www.googleapis.com/upload/drive/v3/files';
    const url = fileId
      ? `${base}/${fileId}?uploadType=multipart&fields=id,name`
      : `${base}?uploadType=multipart&fields=id,name`;
    const response = await fetchDrive(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
    if (!response) return null;
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function read({ fileId, accessToken, fetchDrive, asText = false }) {
    const response = await fetchDrive(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response) return null;
    if (!response.ok) throw new Error(await response.text());
    return asText ? response.text() : response.json();
  }

  async function remove({ fileId, accessToken, fetchDrive }) {
    const response = await fetchDrive(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response) return false;
    if (!response.ok) throw new Error(await response.text());
    return true;
  }

  global.BastAnnualJsonDrive = Object.freeze({ HIDDEN_NAMES, LIST_OPTIONS, visibleFiles, list, listYear, selectYearFile,
    findByName, upload, read, remove });
})(globalThis);
