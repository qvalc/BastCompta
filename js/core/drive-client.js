/* BastCompta - client HTTP commun pour Google Drive appDataFolder. */
(function (global) {
  'use strict';

  async function request(accessToken, url, options = {}) {
    if (!accessToken) throw new Error('Google Drive non connecté.');
    return fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) }
    });
  }

  async function listFiles(accessToken, params = {}) {
    const files = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams();
      query.set('spaces', params.spaces || 'appDataFolder');
      query.set('pageSize', String(params.pageSize || 100));
      query.set('fields', params.fields || 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,trashed)');
      if (params.orderBy) query.set('orderBy', params.orderBy);
      if (params.q) query.set('q', params.q);
      if (pageToken) query.set('pageToken', pageToken);
      const response = await request(accessToken, `https://www.googleapis.com/drive/v3/files?${query}`);
      if (!response.ok) {
        const error = new Error(await response.text());
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      files.push(...(payload.files || []));
      pageToken = payload.nextPageToken || '';
    } while (pageToken);
    return files;
  }

  async function checked(response) {
    if (response.ok) return response;
    const error = new Error(await response.text() || `Google Drive ${response.status}`);
    error.status = response.status;
    throw error;
  }

  async function readFile(accessToken, fileId, options = {}) {
    const response = await request(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    await checked(response);
    if (options.as === 'blob') return response.blob();
    if (options.as === 'text') return response.text();
    return response.json();
  }

  async function uploadFile(accessToken, { fileId = '', metadata = {}, content, mimeType = 'application/octet-stream', fields = 'id,name,modifiedTime' } = {}) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', content instanceof Blob ? content : new Blob([content ?? ''], { type: mimeType }));
    const base = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}`
      : 'https://www.googleapis.com/upload/drive/v3/files';
    const response = await request(accessToken, `${base}?uploadType=multipart&fields=${encodeURIComponent(fields)}`, { method: fileId ? 'PATCH' : 'POST', body: form });
    await checked(response);
    return response.json();
  }

  function uploadJson(accessToken, { fileId = '', name, value, fields } = {}) {
    const metadata = fileId ? { name } : { name, parents: ['appDataFolder'] };
    return uploadFile(accessToken, { fileId, metadata, content: JSON.stringify(value, null, 2), mimeType: 'application/json', fields });
  }

  async function deleteFile(accessToken, fileId) {
    const response = await request(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    await checked(response);
    return true;
  }

  global.BastComptaDriveClient = Object.freeze({ request, listFiles, readFile, uploadFile, uploadJson, deleteFile });
})(globalThis);
