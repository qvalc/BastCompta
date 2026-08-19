/* BastCompta - génération PDF générique à partir d'un élément HTML. */
(function(global){
  'use strict';
  function safeFileName(docKey,documentData={}){
    const prefix=docKey==='quote'?'Devis':docKey==='reminder'?'Rappel':'Facture';
    const number=String(documentData?.documentNumber||'document').trim().replace(/[^a-zA-Z0-9._-]+/g,'-');
    return `${prefix}-${number||'document'}.pdf`;
  }
  function base64ToBlob(base64,mimeType='application/pdf'){
    const binary=global.atob(String(base64||''));
    const bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);
    return new Blob([bytes],{type:mimeType});
  }
  async function elementToBase64(element,options={}){
    const html2canvas=options.html2canvas||global.html2canvas;
    const JsPdf=options.jsPDF||global.jspdf?.jsPDF;
    if(!html2canvas||!JsPdf)throw new Error('Les bibliothèques PDF ne sont pas disponibles. Rechargez la page puis réessayez.');
    if(!element)throw new Error('Document introuvable pour la génération PDF.');
    const canvas=await html2canvas(element,{scale:options.scale||2,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,windowWidth:Math.max(element.scrollWidth,1100),windowHeight:Math.max(element.scrollHeight,1500)});
    const pdf=new JsPdf({orientation:'portrait',unit:'pt',format:'a4'});
    const pageWidth=pdf.internal.pageSize.getWidth();
    const pageHeight=pdf.internal.pageSize.getHeight();
    const margin=Number(options.margin)||24;
    const imageWidth=pageWidth-margin*2;
    const sliceHeight=Math.floor((pageHeight-margin*2)*canvas.width/imageWidth);
    const pageCanvas=global.document.createElement('canvas');
    const context=pageCanvas.getContext('2d');
    pageCanvas.width=canvas.width;
    let y=0,pageIndex=0;
    while(y<canvas.height){
      const currentHeight=Math.min(sliceHeight,canvas.height-y);
      pageCanvas.height=currentHeight;
      context.clearRect(0,0,pageCanvas.width,pageCanvas.height);
      context.drawImage(canvas,0,y,canvas.width,currentHeight,0,0,canvas.width,currentHeight);
      if(pageIndex>0)pdf.addPage();
      const renderedHeight=currentHeight*imageWidth/canvas.width;
      pdf.addImage(pageCanvas.toDataURL('image/jpeg',.96),'JPEG',margin,margin,imageWidth,renderedHeight);
      y+=currentHeight;pageIndex+=1;
    }
    return pdf.output('datauristring').split(',')[1]||'';
  }
  global.BastDocumentPdf=Object.freeze({safeFileName,base64ToBlob,elementToBase64});
})(globalThis);
