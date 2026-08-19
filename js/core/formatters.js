/* BastCompta - formatage pur et partagé. */
(function(global){
  'use strict';
  function number(value,fallback=0){
    if(typeof value==='number')return Number.isFinite(value)?value:fallback;
    const parsed=Number(String(value??'').trim().replace(/\s/g,'').replace(',','.'));
    return Number.isFinite(parsed)?parsed:fallback;
  }
  function money(value,options={}){
    return new Intl.NumberFormat(options.locale||'fr-BE',{style:'currency',currency:options.currency||'EUR'}).format(number(value));
  }
  function date(value,options={}){
    if(!value)return options.empty||'—';
    const source=String(value);
    const parsed=new Date(source+(source.length===10?'T00:00:00':''));
    return Number.isNaN(parsed.getTime())?source:parsed.toLocaleDateString(options.locale||'fr-BE');
  }
  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  }
  function normalizeText(value){
    return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
  }
  global.BastFormatters=Object.freeze({number,money,date,escapeHtml,normalizeText});
})(globalThis);
