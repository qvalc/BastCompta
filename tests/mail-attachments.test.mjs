import assert from 'node:assert/strict';
import '../js/modules/documents/mail-attachments.js';

const attachments = globalThis.BastMailAttachments;
const now = new Date('2026-08-19T10:30:00.000Z');
assert.equal(attachments.driveName('Facture-F-001.pdf', now), 'mail-2026-08-19T10-30-00-000Z-Facture-F-001.pdf');

const calls = [];
const driveClient = {
  async uploadFile(token, payload) {
    calls.push(['upload', token, payload]);
    return { id: 'drive-1', name: payload.metadata.name };
  },
  async readFile(token, fileId, options) {
    calls.push(['read', token, fileId, options]);
    return { type: 'application/pdf', fileId };
  },
  async deleteFile(token, fileId) {
    calls.push(['delete', token, fileId]);
    return true;
  }
};
const pdfService = { base64ToBlob: value => ({ pdfBase64: value }) };
const archived = await attachments.archive({
  accessToken: 'token', pdfBase64: 'PDF', pdfName: 'Facture.pdf', now, driveClient, pdfService
});
assert.equal(archived.fileId, 'drive-1');
assert.equal(calls[0][2].mimeType, 'application/pdf');
assert.deepEqual(calls[0][2].metadata.parents, ['appDataFolder']);
assert.deepEqual(await attachments.read({ attachmentFileId: 'drive-1' }, { accessToken: 'token', driveClient }), {
  type: 'application/pdf', fileId: 'drive-1'
});
assert.equal(await attachments.remove({ attachmentFileId: 'drive-1' }, { accessToken: 'token', driveClient }), true);
assert.equal(await attachments.remove({}, { accessToken: 'token', driveClient }), false);
await assert.rejects(() => attachments.read({}, { accessToken: 'token', driveClient }), /n’est pas archivée/);
await assert.rejects(() => attachments.read({ attachmentFileId: 'drive-1' }, { driveClient }), /Reconnecte Google Drive/);
const removed = await attachments.removeAll([{ attachmentFileId: 'a' }, {}, { attachmentFileId: 'b' }], { accessToken: 'token', driveClient });
assert.equal(removed.length, 2);

console.log('Archivage des pièces jointes e-mail valide.');
