/* BastCompta - composants d'interface de la bibliothèque de tarifs. */
(function(global){
  'use strict';
  const escape=value=>global.BastFormatters.escapeHtml(value);
  function actionMenu(items=[]){
    const buttons=items.map(item=>item.separator
      ? '<div class="tarif-action-separator" role="separator"></div>'
      : `<button type="button" class="${item.danger?'danger-item':''}" onclick="event.preventDefault(); event.stopPropagation(); this.closest('details').removeAttribute('open'); ${item.action||''}">${escape(item.label)}</button>`).join('');
    return `<details class="tarif-action-menu" onclick="event.stopPropagation()" ontoggle="if(this.open) document.querySelectorAll('.tarif-action-menu[open]').forEach(menu => { if (menu !== this) menu.removeAttribute('open'); })"><summary title="Actions" aria-label="Actions">•••</summary><div class="tarif-action-panel">${buttons}</div></details>`;
  }
  function selectOptions(values=[],selected=''){
    return values.map(value=>typeof value==='object'?value:{value,label:value}).map(option=>`<option value="${escape(option.value)}" ${option.value===selected?'selected':''}>${escape(option.label)}</option>`).join('');
  }
  function closeModal(){global.document?.getElementById('tarifModalOverlay')?.remove();}
  function openModal({title,label,value='',type='text',options=[],confirmLabel='Enregistrer',onConfirm}={}){
    closeModal();
    const overlay=global.document.createElement('div');overlay.id='tarifModalOverlay';overlay.className='tarif-modal-overlay';
    const field=type==='select'?`<select id="tarifModalField">${selectOptions(options,value)}</select>`:`<input id="tarifModalField" type="text" value="${escape(value)}" autocomplete="off">`;
    overlay.innerHTML=`<div class="tarif-modal" role="dialog" aria-modal="true" aria-labelledby="tarifModalTitle"><div class="tarif-modal-head"><h3 id="tarifModalTitle">${escape(title)}</h3><button type="button" class="tarif-modal-close" aria-label="Fermer">×</button></div><label for="tarifModalField">${escape(label)}</label>${field}<div class="tarif-modal-actions"><button type="button" class="tarif-modal-cancel">Annuler</button><button type="button" class="primary tarif-modal-confirm">${escape(confirmLabel)}</button></div></div>`;
    global.document.body.appendChild(overlay);
    const input=overlay.querySelector('#tarifModalField');
    const submit=()=>{const result=String(input?.value??'').trim();if(!result&&type!=='select')return input?.focus();if(typeof onConfirm==='function'&&onConfirm(result)===false)return;closeModal();};
    overlay.querySelector('.tarif-modal-close').onclick=closeModal;overlay.querySelector('.tarif-modal-cancel').onclick=closeModal;overlay.querySelector('.tarif-modal-confirm').onclick=submit;
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeModal();});
    input?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit();}if(event.key==='Escape')closeModal();});
    setTimeout(()=>{input?.focus();if(type!=='select')input?.select();},0);
  }
  global.BastTariffsUi=Object.freeze({actionMenu,selectOptions,openModal,closeModal});
})(globalThis);
