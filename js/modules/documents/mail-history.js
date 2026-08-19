/* BastCompta - modèle pur de l'historique des e-mails envoyés. */
(function(global){
  'use strict';
  function createItem(payload={},options={}){
    const now=options.now?.()||new Date();
    const id=options.createId?.()||`mail_${now.getTime()}_${Math.random().toString(36).slice(2,8)}`;
    const doc=payload.doc||{};
    return {id,sentAt:now.toISOString(),docKey:payload.docKey||'',documentNumber:doc.documentNumber||'',clientName:doc.clientName||'',to:payload.to||'',cc:payload.cc||'',subject:payload.subject||'',body:payload.body||'',pdfName:payload.pdfName||'',messageId:payload.messageId||'',senderEmail:payload.senderEmail||'',replyTo:payload.replyTo||''};
  }
  function add(items,payload,options={}){
    const list=Array.isArray(items)?items:[];
    return [createItem(payload,options),...list].slice(0,Number(options.limit)||500);
  }
  function remove(items,id){return (Array.isArray(items)?items:[]).filter(item=>item.id!==id);}
  function merge(localItems,remoteItems,limit=500){
    const merged=new Map();
    [...(Array.isArray(remoteItems)?remoteItems:[]),...(Array.isArray(localItems)?localItems:[])].forEach(item=>{
      if(!item||typeof item!=='object')return;
      const key=item.id||item.messageId||`${item.sentAt||''}|${item.to||''}|${item.subject||''}`;
      if(!key)return;
      merged.set(key,{...(merged.get(key)||{}),...item});
    });
    return [...merged.values()]
      .sort((a,b)=>String(b.sentAt||'').localeCompare(String(a.sentAt||'')))
      .slice(0,Number(limit)||500);
  }
  function formatDate(value,locale='fr-BE'){
    const date=value?new Date(value):null;
    if(!date||Number.isNaN(date.getTime()))return'';
    return date.toLocaleString(locale,{dateStyle:'short',timeStyle:'short'});
  }
  global.BastMailHistory=Object.freeze({createItem,add,remove,merge,formatDate});
})(globalThis);
