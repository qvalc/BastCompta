import assert from 'node:assert/strict';
import '../js/modules/documents/pdf-service.js';

assert.equal(BastDocumentPdf.safeFileName('quote',{documentNumber:'D 2026/001'}),'Devis-D-2026-001.pdf');
assert.equal(BastDocumentPdf.safeFileName('invoice',{documentNumber:'F-001'}),'Facture-F-001.pdf');
assert.equal(BastDocumentPdf.safeFileName('reminder',{}),'Rappel-document.pdf');
const pdfBlob=BastDocumentPdf.base64ToBlob('JVBERi0xLjQ=');
assert.equal(pdfBlob.type,'application/pdf');
assert.equal(pdfBlob.size,8);
await assert.rejects(()=>BastDocumentPdf.elementToBase64(null),/bibliothèques PDF/);
console.log('Service PDF commun valide.');
