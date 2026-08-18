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

  global.BastComptaDriveClient = Object.freeze({ request, listFiles });
})(window);
