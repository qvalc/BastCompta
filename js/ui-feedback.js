(function(){
  'use strict';

  const state={queue:[],active:false};

  function ensureUi(){
    if (document.getElementById('bastUiToastRegion')) return;
    const region=document.createElement('div');
    region.id='bastUiToastRegion';
    region.className='bast-ui-toasts';
    region.setAttribute('aria-live','polite');
    region.setAttribute('aria-atomic','true');
    document.body.appendChild(region);

    const layer=document.createElement('div');
    layer.id='bastUiDialogLayer';
    layer.className='bast-ui-dialog-layer';
    layer.hidden=true;
    layer.innerHTML='<div class="bast-ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bastUiDialogTitle" aria-describedby="bastUiDialogMessage"><div class="bast-ui-dialog-icon" aria-hidden="true"></div><div class="bast-ui-dialog-copy"><h2 id="bastUiDialogTitle"></h2><p id="bastUiDialogMessage"></p></div><div class="bast-ui-dialog-actions"><button type="button" class="bast-ui-cancel">Annuler</button><button type="button" class="bast-ui-confirm">Confirmer</button></div></div>';
    document.body.appendChild(layer);
  }

  function inferType(message,type){
    if (type) return type;
    const value=String(message||'').toLocaleLowerCase('fr');
    if (/erreur|échec|impossible|invalide|expir|refus|introuvable/.test(value)) return 'error';
    if (/attention|avert|incomplet|non connecté|bloqué/.test(value)) return 'warning';
    if (/réussi|terminé|sauvegard|enregistr|ajouté|envoyé|supprimé|copié|import/.test(value)) return 'success';
    return 'info';
  }

  function iconFor(type){
    if(type==='success')return '✓';
    if(type==='error')return '!';
    if(type==='warning')return '!';
    return 'i';
  }

  function notify(message,options={}){
    ensureUi();
    const text=String(message??'').trim();
    if(!text)return;
    const type=inferType(text,options.type);
    const toast=document.createElement('div');
    toast.className='bast-ui-toast is-'+type;
    toast.setAttribute('role',type==='error'?'alert':'status');
    toast.innerHTML='<span class="bast-ui-toast-icon" aria-hidden="true">'+iconFor(type)+'</span><span class="bast-ui-toast-message"></span><button type="button" aria-label="Fermer">×</button>';
    toast.querySelector('.bast-ui-toast-message').textContent=text;
    const close=()=>{toast.classList.remove('is-visible');setTimeout(()=>toast.remove(),180);};
    toast.querySelector('button').addEventListener('click',close);
    document.getElementById('bastUiToastRegion').appendChild(toast);
    requestAnimationFrame(()=>toast.classList.add('is-visible'));
    setTimeout(close,options.duration || (type==='error'?7000:4500));
  }

  function confirmDialog(message,options={}){
    return new Promise(resolve=>{
      state.queue.push({message:String(message??''),options,resolve});
      showNext();
    });
  }

  function showNext(){
    if(state.active||!state.queue.length)return;
    ensureUi();
    state.active=true;
    const item=state.queue.shift();
    const layer=document.getElementById('bastUiDialogLayer');
    const dialog=layer.querySelector('.bast-ui-dialog');
    const title=layer.querySelector('#bastUiDialogTitle');
    const message=layer.querySelector('#bastUiDialogMessage');
    const cancel=layer.querySelector('.bast-ui-cancel');
    const confirm=layer.querySelector('.bast-ui-confirm');
    const type=item.options.type||'warning';
    dialog.dataset.type=type;
    title.textContent=item.options.title||(type==='danger'?'Confirmer la suppression':'Confirmation');
    message.textContent=item.message;
    cancel.textContent=item.options.cancelLabel||'Annuler';
    confirm.textContent=item.options.confirmLabel||'Confirmer';
    layer.hidden=false;
    document.body.classList.add('bast-ui-dialog-open');
    const finish=result=>{
      layer.hidden=true;
      document.body.classList.remove('bast-ui-dialog-open');
      cancel.onclick=null;confirm.onclick=null;layer.onclick=null;document.removeEventListener('keydown',onKey);
      state.active=false;item.resolve(result);showNext();
    };
    const onKey=event=>{if(event.key==='Escape')finish(false);};
    cancel.onclick=()=>finish(false);
    confirm.onclick=()=>finish(true);
    layer.onclick=event=>{if(event.target===layer)finish(false);};
    document.addEventListener('keydown',onKey);
    setTimeout(()=>confirm.focus(),0);
  }

  window.BastUI={notify,alert:notify,confirm:confirmDialog};
  window.alert=message=>notify(message);
})();
