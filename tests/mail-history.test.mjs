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
const merged=BastMailHistory.merge(
  [{id:'local',sentAt:'2026-08-19T11:00:00Z'},{id:'shared',sentAt:'2026-08-19T10:00:00Z',subject:'Version locale'}],
  [{id:'remote',sentAt:'2026-08-19T09:00:00Z'},{id:'shared',sentAt:'2026-08-19T10:00:00Z',subject:'Version distante'}]
);
assert.deepEqual(merged.map(item=>item.id),['local','shared','remote']);
assert.equal(merged.find(item=>item.id==='shared').subject,'Version locale');
console.log('Historique e-mail commun valide.');
