(function(global){
  'use strict';
  const KEY='bastcompta-trash-v1';
  const RETENTION_DAYS=30;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const uid=()=>`trash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  function read(){
    try{
      const items=JSON.parse(localStorage.getItem(KEY)||'[]');
      const now=Date.now();
      const active=Array.isArray(items)?items.filter(item=>new Date(item.expiresAt).getTime()>now):[];
      if(active.length!==(Array.isArray(items)?items.length:0))write(active);
      return active;
    }catch{return[];}
  }
  function write(items){localStorage.setItem(KEY,JSON.stringify(items));}
  function add({module,type,label,storageKey,path,item}){
    if(!storageKey||!path||item==null)return null;
    const deletedAt=new Date();
    const entry={id:uid(),module:module||'autres',type:type||'Élément',label:label||'Élément supprimé',storageKey,path:Array.isArray(path)?path:[path],item:clone(item),deletedAt:deletedAt.toISOString(),expiresAt:new Date(deletedAt.getTime()+RETENTION_DAYS*86400000).toISOString()};
    const items=read();items.unshift(entry);write(items);
    window.dispatchEvent(new CustomEvent('basttrashchange'));
    return entry;
  }
  function remove(id){const items=read().filter(item=>item.id!==id);write(items);window.dispatchEvent(new CustomEvent('basttrashchange'));}
  function clear(){write([]);window.dispatchEvent(new CustomEvent('basttrashchange'));}
  function restore(id){
    const entry=read().find(item=>item.id===id);if(!entry)return{ok:false,message:'Élément introuvable.'};
    try{
      const root=JSON.parse(localStorage.getItem(entry.storageKey)||'{}');
      let target=root;
      entry.path.forEach((segment,index)=>{
        if(index===entry.path.length-1){if(!Array.isArray(target[segment]))target[segment]=[];target=target[segment];}
        else{if(!target[segment]||typeof target[segment]!=='object')target[segment]={};target=target[segment];}
      });
      const duplicate=entry.item?.id&&target.some(item=>String(item?.id)===String(entry.item.id));
      if(duplicate)return{ok:false,message:'Cet élément existe déjà dans le module.'};
      target.unshift(clone(entry.item));
      if(root&&typeof root==='object')root.updatedAt=new Date().toISOString();
      localStorage.setItem(entry.storageKey,JSON.stringify(root));remove(id);
      return{ok:true,entry};
    }catch(error){return{ok:false,message:error?.message||'Restauration impossible.'};}
  }
  global.BastTrash={key:KEY,retentionDays:RETENTION_DAYS,list:read,add,remove,clear,restore};
})(window);
