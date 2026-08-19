/* BastCompta - noms et téléchargements de fichiers partagés. */
(function(global){
  'use strict';
  function safeNamePart(value,fallback='fichier',maxLength=60){
    return String(value||fallback).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,maxLength)||fallback;
  }
  function createId(prefix='id',options={}){
    const separator=options.separator||'-';
    const randomLength=Number(options.randomLength)||6;
    return `${prefix}${separator}${Date.now().toString(36)}${separator}${Math.random().toString(36).slice(2,2+randomLength)}`;
  }
  function downloadBlob(blob,fileName){
    if(!global.document||!global.URL)throw new Error('Téléchargement indisponible dans ce contexte.');
    const url=global.URL.createObjectURL(blob);
    const downloadName=String(fileName||'fichier').trim().replace(/[\\/:*?"<>|]+/g,'-').slice(0,180)||'fichier';
    const link=global.document.createElement('a');link.href=url;link.download=downloadName;link.click();
    setTimeout(()=>global.URL.revokeObjectURL(url),0);
  }
  function parseJson(raw,fallback=null){
    if(raw===null||raw===undefined||raw==='')return fallback;
    try{return JSON.parse(raw);}catch{return fallback;}
  }
  async function parseJsonFile(file){
    if(!file||typeof file.text!=='function')throw new TypeError('Fichier JSON invalide.');
    return JSON.parse(await file.text());
  }
  function jsonBlob(value,spacing=2){return new Blob([JSON.stringify(value,null,spacing)],{type:'application/json'});}
  function downloadJson(value,fileName,spacing=2){downloadBlob(jsonBlob(value,spacing),fileName);}
  global.BastFileUtils=Object.freeze({safeNamePart,createId,downloadBlob,parseJson,parseJsonFile,jsonBlob,downloadJson});
})(globalThis);
