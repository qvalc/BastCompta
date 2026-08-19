/* BastCompta - archivage Drive des pièces jointes envoyées. */
(function (global) {
  'use strict';

  function driveName(pdfName, now = new Date()) {
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    return `mail-${timestamp}-${String(pdfName || 'document.pdf')}`;
  }

  async function archive(options = {}) {
    const accessToken = options.accessToken || '';
    if (!accessToken) return null;
    const driveClient = options.driveClient || global.BastComptaDriveClient;
    const pdfService = options.pdfService || global.BastDocumentPdf;
    const name = driveName(options.pdfName, options.now || new Date());
    const file = await driveClient.uploadFile(accessToken, {
      metadata: { name, parents: ['appDataFolder'] },
      content: pdfService.base64ToBlob(options.pdfBase64),
      mimeType: 'application/pdf',
      fields: 'id,name,modifiedTime'
    });
    return { fileId: file.id || '', driveName: file.name || name };
  }

  async function read(item, options = {}) {
    if (!item?.attachmentFileId) throw new Error('Cette pièce jointe n’est pas archivée dans Drive.');
    const accessToken = options.accessToken || '';
    if (!accessToken) throw new Error('Reconnecte Google Drive pour ouvrir cette pièce jointe.');
    const driveClient = options.driveClient || global.BastComptaDriveClient;
    return driveClient.readFile(accessToken, item.attachmentFileId, { as: 'blob' });
  }

  async function remove(item, options = {}) {
    if (!item?.attachmentFileId) return false;
    const accessToken = options.accessToken || '';
    if (!accessToken) return false;
    const driveClient = options.driveClient || global.BastComptaDriveClient;
    await driveClient.deleteFile(accessToken, item.attachmentFileId);
    return true;
  }

  async function removeAll(items, options = {}) {
    const attachments = (Array.isArray(items) ? items : []).filter(item => item?.attachmentFileId);
    return Promise.allSettled(attachments.map(item => remove(item, options)));
  }

  global.BastMailAttachments = Object.freeze({ driveName, archive, read, remove, removeAll });
})(globalThis);
