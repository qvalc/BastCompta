import assert from 'node:assert/strict';
import '../js/modules/accounting/purchase-pdf-drive.js';

const pdfDrive = globalThis.BastPurchasePdfDrive;
assert.equal(pdfDrive.fileName({ date: '2026-08-19', supplier: 'Éts Démo & Fils', invoiceNumber: 'A/42' }, 'Ma facture.PDF'),
  'achat-2026-08-19-Ets-Demo-Fils-A-42-Ma-facture.pdf');
assert.equal(pdfDrive.fileName({}, ''), 'achat-sans-date-fournisseur-sans-numero-facture.pdf');
assert.equal(pdfDrive.year({ name: 'achat-2026-08-19-demo.pdf' }), '2026');
assert.equal(pdfDrive.year({ name: 'document.pdf', modifiedTime: '2025-03-01T10:00:00Z' }), '2025');
assert.equal(pdfDrive.year({ name: 'document.pdf' }), 'Sans année');

let listOptions;
const files = await pdfDrive.list(async options => {
  listOptions = options;
  return { result: { files: [{ id: '1', name: 'achat-test.pdf' }] } };
});
assert.deepEqual(files, [{ id: '1', name: 'achat-test.pdf' }]);
assert.equal(listOptions.spaces, 'appDataFolder');
assert.match(listOptions.q, /application\/pdf/);

const purchases = [
  { pdfFileId: '1', pdfFileName: 'a.pdf', pdfModifiedTime: 'date' },
  { pdfFileId: '2', pdfFileName: 'b.pdf' },
  { pdfFileId: '1', pdfFileName: 'c.pdf' }
];
assert.equal(pdfDrive.unlinkPurchases(purchases, '1'), 2);
assert.deepEqual(purchases.map(row => row.pdfFileId), ['', '2', '']);

let removedRequest;
assert.equal(await pdfDrive.remove({ fileId: 'abc', accessToken: 'token', fetchDrive: async (url, options) => {
  removedRequest = { url, options };
  return { ok: true };
} }), true);
assert.match(removedRequest.url, /files\/abc$/);
assert.equal(removedRequest.options.method, 'DELETE');
assert.equal(removedRequest.options.headers.Authorization, 'Bearer token');
console.log("Service Drive des factures d'achat valide.");
