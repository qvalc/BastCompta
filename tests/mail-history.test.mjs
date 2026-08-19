import assert from 'node:assert/strict';
import '../js/modules/documents/mail-history.js';

const now=new Date('2026-08-19T10:30:00Z');
const list=BastMailHistory.add([],{docKey:'invoice',doc:{documentNumber:'F-001',clientName:'Client'},to:'client@example.com',subject:'Facture'},{now:()=>now,createId:()=> 'mail-1'});
assert.equal(list[0].id,'mail-1');
assert.equal(list[0].documentNumber,'F-001');
assert.equal(list[0].clientName,'Client');
assert.equal(list[0].sentAt,now.toISOString());
assert.deepEqual(BastMailHistory.remove(list,'mail-1'),[]);
assert.equal(BastMailHistory.formatDate('invalide'),'');
const limited=BastMailHistory.add([{id:'old-1'},{id:'old-2'}],{},{createId:()=> 'new',limit:2});
assert.deepEqual(limited.map(item=>item.id),['new','old-1']);
console.log('Historique e-mail commun valide.');
