import assert from 'node:assert/strict';
import '../js/modules/accounting/annual-json-drive.js';

const drive = globalThis.BastAnnualJsonDrive;
assert.deepEqual(drive.visibleFiles([
  { id: '1', name: 'comptabilite-demo-2026.json' },
  { id: '2', name: 'bastcompta-comptabilite-sync.json' }
]).map(file => file.id), ['1']);

let listOptions;
const listed = await drive.list(async options => {
  listOptions = options;
  return { result: { files: [{ id: '1', name: 'comptabilite-demo-2026.json' }] } };
});
assert.equal(listed.length, 1);
assert.match(listOptions.q, /mimeType='application\/json'/);

const found = await drive.findByName({ fileName: "comptabilite-l'entreprise-2026.json", escapeQuery: value => value.replaceAll("'", "\\'"),
  listFiles: async options => ({ result: { files: [{ id: 'abc', name: options.q }] } }) });
assert.equal(found.id, 'abc');
assert.match(found.name, /l\\'entreprise/);

let uploadRequest;
const saved = await drive.upload({ sourceData: { company: { period: '2026' } }, fileName: 'comptabilite-2026.json', fileId: 'abc', accessToken: 'token',
  fetchDrive: async (url, options) => { uploadRequest = { url, options }; return { ok: true, json: async () => ({ id: 'abc', name: 'comptabilite-2026.json' }) }; } });
assert.equal(saved.id, 'abc');
assert.match(uploadRequest.url, /files\/abc\?uploadType=multipart/);
assert.equal(uploadRequest.options.method, 'PATCH');

const parsed = await drive.read({ fileId: 'abc', accessToken: 'token', fetchDrive: async () => ({ ok: true, json: async () => ({ sales: [] }) }) });
assert.deepEqual(parsed, { sales: [] });
assert.equal(await drive.remove({ fileId: 'abc', accessToken: 'token', fetchDrive: async () => ({ ok: true }) }), true);
console.log('Service JSON annuel Drive valide.');
