import assert from 'node:assert/strict';
import '../js/core/drive-client.js';

const originalFetch=globalThis.fetch;
const calls=[];
globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),options});
  if(String(url).includes('alt=media'))return new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json'}});
  if(options.method==='DELETE')return new Response(null,{status:204});
  if(String(url).includes('/upload/'))return new Response('{"id":"f1","name":"test.json"}',{status:200,headers:{'content-type':'application/json'}});
  return new Response('{"files":[{"id":"f1","name":"test.json"}]}',{status:200,headers:{'content-type':'application/json'}});
};
try{
  const files=await BastComptaDriveClient.listFiles('token',{q:"name='test.json'"});
  assert.equal(files[0].id,'f1');
  assert.deepEqual(await BastComptaDriveClient.readFile('token','f1'),{ok:true});
  assert.equal((await BastComptaDriveClient.uploadJson('token',{name:'test.json',value:{ok:true}})).id,'f1');
  assert.equal(await BastComptaDriveClient.deleteFile('token','f1'),true);
  assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer token'));
  assert.match(calls[0].url,/spaces=appDataFolder/);
}finally{globalThis.fetch=originalFetch;}
console.log('Client Google Drive commun valide.');
