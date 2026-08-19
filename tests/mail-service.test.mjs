import assert from 'node:assert/strict';
import '../js/core/formatters.js';
import '../js/modules/documents/mail-service.js';

assert.equal(BastDocumentMail.textToHtml('Bonjour & bienvenue\nLigne 2'),'Bonjour &amp; bienvenue<br>Ligne 2');
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://mail.test');assert.equal(options.headers.Authorization,'Bearer token');return new Response('{"ok":true,"messageId":"m1"}',{status:200,headers:{'content-type':'application/json'}});};
try{assert.equal((await BastDocumentMail.callWorker('https://mail.test','token','send',{to:'test@example.com'})).messageId,'m1');}finally{globalThis.fetch=originalFetch;}
await assert.rejects(()=>BastDocumentMail.callWorker('https://mail.test','','send'),/Session BastCompta/);
console.log('Service e-mail commun valide.');
