/* BastCompta - aperçu et transport e-mail des documents. */
(function(global){
  'use strict';
  function textToHtml(text){return global.BastFormatters.escapeHtml(String(text||'')).replace(/\r?\n/g,'<br>');}
  async function callWorker(url,token,action,payload={}){
    if(!token)throw new Error('Session BastCompta introuvable. Reconnectez-vous puis réessayez.');
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({action,...payload})});
    let result={};try{result=await response.json();}catch{}
    if(!response.ok||result?.ok===false)throw new Error(result?.error||`Erreur e-mail (${response.status}).`);
    return result;
  }
  function openPreview(defaults={},options={}){
    const sanitize=options.sanitizeEmail||function(value){return String(value||'').trim();};
    const escape=global.BastFormatters.escapeHtml;
    const attr=value=>escape(value).replace(/`/g,'&#096;');
    return new Promise(resolve=>{
      global.document.querySelector('.mail-preview-overlay')?.remove();
      const overlay=global.document.createElement('div');
      overlay.className='mail-preview-overlay';
      overlay.innerHTML=`<div class="mail-preview-modal" role="dialog" aria-modal="true" aria-labelledby="mail-preview-title"><div class="mail-preview-head"><h3 id="mail-preview-title">Aperçu avant envoi</h3><button type="button" class="mail-preview-close" aria-label="Fermer">×</button></div><div class="mail-preview-body"><div class="mail-preview-field"><label>À</label><input id="mail-preview-to" type="email" value="${attr(defaults.to||'')}"></div><div class="mail-preview-field"><label>Copie (Cc)</label><input id="mail-preview-cc" type="email" value="${attr(defaults.cc||'')}"></div><div class="mail-preview-field"><label>Objet</label><input id="mail-preview-subject" type="text" value="${attr(defaults.subject||'')}"></div><div class="mail-preview-field"><label>Message</label><textarea id="mail-preview-body">${escape(defaults.body||'')}</textarea></div><div class="mail-preview-field"><label>Pièce jointe</label><div class="mail-preview-attachment">📎 <span>${escape(defaults.pdfName||'document.pdf')}</span></div></div></div><div class="mail-preview-actions"><button type="button" class="secondary" data-action="cancel">Annuler</button><button type="button" class="primary" data-action="send">Envoyer</button></div></div>`;
      const finish=value=>{overlay.remove();resolve(value);};
      overlay.querySelector('.mail-preview-close').addEventListener('click',()=>finish(null));
      overlay.querySelector('[data-action="cancel"]').addEventListener('click',()=>finish(null));
      overlay.addEventListener('click',event=>{if(event.target===overlay)finish(null);});
      overlay.querySelector('[data-action="send"]').addEventListener('click',()=>{
        const to=sanitize(overlay.querySelector('#mail-preview-to').value);
        const cc=sanitize(overlay.querySelector('#mail-preview-cc').value);
        const subject=overlay.querySelector('#mail-preview-subject').value.trim();
        const body=overlay.querySelector('#mail-preview-body').value;
        if(!to)return global.alert("Renseigne l'adresse e-mail du destinataire.");
        if(!subject)return global.alert("Renseigne l'objet du message.");
        if(!body.trim())return global.alert('Le message est vide.');
        finish({to,cc,subject,body});
      });
      global.document.body.appendChild(overlay);
      overlay.querySelector('#mail-preview-subject')?.focus();
    });
  }
  function openSentItem(item={},options={}){
    const escape=global.BastFormatters.escapeHtml;
    const formatDate=options.formatDate||function(value){return String(value||'');};
    global.document.querySelector('.mail-preview-overlay')?.remove();
    const overlay=global.document.createElement('div');
    overlay.className='mail-preview-overlay';
    const attachmentActions=item.attachmentFileId?`<button type="button" class="secondary" data-action="view-attachment">Voir le PDF</button><button type="button" class="secondary" data-action="download-attachment">Télécharger</button>`:'';
    overlay.innerHTML=`<div class="mail-preview-modal sent-mail-viewer" role="dialog" aria-modal="true" aria-labelledby="sent-mail-viewer-title"><div class="mail-preview-head"><div><h3 id="sent-mail-viewer-title">${escape(item.subject||'Message envoyé')}</h3><div class="muted-small">Envoyé le ${escape(formatDate(item.sentAt)||'—')}</div></div><button type="button" class="mail-preview-close" aria-label="Fermer">×</button></div><div class="mail-preview-body"><div class="sent-mail-viewer-grid"><div><span>De</span><strong>${escape(item.senderEmail||'—')}</strong></div><div><span>À</span><strong>${escape(item.to||'—')}</strong></div><div><span>Réponse à</span><strong>${escape(item.replyTo||'—')}</strong></div><div><span>Copie</span><strong>${escape(item.cc||'—')}</strong></div><div><span>Document</span><strong>${escape(item.documentNumber||'—')}</strong></div><div><span>Pièce jointe</span><strong>${escape(item.pdfName||'—')}</strong></div></div><div class="mail-preview-field"><label>Message</label><pre class="sent-mail-viewer-body">${escape(item.body||'')}</pre></div>${item.messageId?`<div class="muted-small">Identifiant d’envoi : ${escape(item.messageId)}</div>`:''}</div><div class="mail-preview-actions">${attachmentActions}<button type="button" class="primary" data-action="close">Fermer</button></div></div>`;
    const close=()=>overlay.remove();
    overlay.querySelector('.mail-preview-close').addEventListener('click',close);
    overlay.querySelector('[data-action="close"]').addEventListener('click',close);
    overlay.querySelector('[data-action="view-attachment"]')?.addEventListener('click',()=>options.onViewAttachment?.(item));
    overlay.querySelector('[data-action="download-attachment"]')?.addEventListener('click',()=>options.onDownloadAttachment?.(item));
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    global.document.body.appendChild(overlay);
  }
  global.BastDocumentMail=Object.freeze({textToHtml,callWorker,openPreview,openSentItem});
})(globalThis);
