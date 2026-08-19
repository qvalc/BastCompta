(function () {
  'use strict';

  const ICONS = {
    add:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    save:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>',
    send:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
    print:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>',
    export:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>',
    import:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M5 13v7h14v-7"/></svg>',
    download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
    upload:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></svg>',
    delete:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v6h-6"/><path d="M4 18v-6h6"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>',
    drive:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 3h9L22 12l-4.5 9h-11L2 12z"/><path d="m7.5 3 5 9M16.5 3 12 12M2 12h20"/></svg>',
    copy:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    file:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></svg>',
    xml:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 6l-4 12"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    view:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
    open:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v7H3V3h7"/></svg>',
    link:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    accounting:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"/></svg>',
    check:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    generic:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2" class="bast-icon-solid"/><circle cx="5" cy="12" r="2" class="bast-icon-solid"/><circle cx="19" cy="12" r="2" class="bast-icon-solid"/></svg>'
  };

  function normalizedText(el){
    return (el.dataset.tooltip || el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g,' ').trim();
  }

  function classify(label){
    const s = label.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if (/suppr|vider|effacer/.test(s)) return ['delete','delete'];
    if (/sauvegard|enregistr/.test(s)) return ['save','save'];
    if (/envoyer(?!.*drive)|email|mail/.test(s)) return ['send','send'];
    if (/imprim|\bpdf\b/.test(s)) return ['print','print'];
    if (/export|modele excel/.test(s)) return ['export','export'];
    if (/telecharg/.test(s)) return ['download','download'];
    if (/import|charger depuis/.test(s)) return ['import','import'];
    if (/envoyer.*drive|vers drive/.test(s)) return ['upload','upload'];
    if (/google drive|drive/.test(s)) return ['drive','drive'];
    if (/xml|peppol/.test(s)) return ['xml','xml'];
    if (/copier/.test(s)) return ['copy','copy'];
    if (/parametre|reglage/.test(s)) return ['settings','settings'];
    if (/intervat|comptabil/.test(s)) return ['accounting','accounting'];
    if (/actualis|rafraich|relancer|recharger/.test(s)) return ['refresh','refresh'];
    if (/modifier|reprendre|editer/.test(s)) return ['edit','edit'];
    if (/recherch/.test(s)) return ['search','search'];
    if (/consulter|apercu|voir|afficher/.test(s)) return ['view','view'];
    if (/ouvrir/.test(s)) return ['open','open'];
    if (/lier/.test(s)) return ['link','link'];
    if (/verifier|valider/.test(s)) return ['check','check'];
    if (/ajout|nouveau|nouvelle|creer/.test(s)) return ['add','add'];
    if (/fichier|document/.test(s)) return ['file','file'];
    return ['generic','generic'];
  }

  function isExcluded(el){
    if (!el || el.dataset.bastIconified === '1') return true;
    if (el.matches('.toolbar-action-icon,.delete-icon-btn,.icon-btn,.icon-button,.sidebar-toggle,.sidebar-close,.mobile-menu,.faq-nav-item,.auth-tab,.tab,.tab-btn,.global-filter-btn,.supplier-item,.worker-item,.hidden-drive-tab,.main-tab')) return true;
    if (el.closest('nav,.tabs,.sidebar,.supplier-list,.worker-list,.modal,.modal-backdrop,.dialog,.dropdown-menu,.global-filter-tabs,.landing-page,.auth-screen')) return true;
    if (el.closest('.modal-actions')) return true;
    return false;
  }

  function shouldIconify(el){
    if (isExcluded(el)) return false;
    const label = normalizedText(el);
    if (!label || label.length > 70) return false;
    const actionArea = el.closest('.toolbar-actions,.topbar .actions,.topbar .top-actions,.article-toolbar,.profile-actions,.workspace-head .actions,.section-head,.section-title-row,.global-head,.panel-head-row,.peppol-actions,.mail-preview-actions,.mail-sender-actions,.tarif-card-actions,.tarif-component-actions,.actions');
    if (actionArea) return true;
    return /^(\+\s*)?(Ajouter|Nouveau|Nouvelle|Créer|Modifier|Reprendre|Imprimer|Exporter|Importer|Télécharger|Sauvegarder|Enregistrer|Actualiser|Relancer|Recharger|Supprimer|Vider|Copier|Ouvrir|Voir|Afficher|Consulter|Envoyer|Intervat|Google Drive|Paramètres|Modèle Excel)/i.test(label);
  }

  function iconify(el){
    if (!shouldIconify(el)) return;
    const label = normalizedText(el);
    const [icon,kind] = classify(label);
    const inputs = el.matches('label') ? Array.from(el.querySelectorAll('input')) : [];
    inputs.forEach(input=>input.remove());
    el.innerHTML = ICONS[icon] || ICONS.generic;
    inputs.forEach(input=>el.appendChild(input));
    el.classList.add('bast-action-icon','bast-action-'+kind);
    el.dataset.tooltip = label;
    el.dataset.bastIconified = '1';
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label',label);
    if (el.matches('button') && !el.getAttribute('type')) el.setAttribute('type','button');
  }

  function positionTooltip(el){
    if (!el?.matches?.('.bast-action-icon,.has-tooltip')) return;
    el.classList.remove('bast-tooltip-left','bast-tooltip-right');
    const label = normalizedText(el);
    const rect = el.getBoundingClientRect();
    const estimatedWidth = Math.min(280, Math.max(80, label.length * 7 + 18));
    const margin = 10;
    if (rect.left + rect.width / 2 - estimatedWidth / 2 < margin) {
      el.classList.add('bast-tooltip-left');
    } else if (rect.left + rect.width / 2 + estimatedWidth / 2 > window.innerWidth - margin) {
      el.classList.add('bast-tooltip-right');
    }
  }

  function flattenTopbarDropdowns(root=document){
    root.querySelectorAll('.topbar .actions > .dropdown:not([data-bast-flattened])').forEach(drop=>{
      const parent = drop.parentElement;
      const menu = drop.querySelector('.dropdown-menu');
      if (!parent || !menu) return;
      drop.dataset.bastFlattened='1';
      Array.from(menu.children).forEach(child=>{
        if (child.matches('button,label.file-label')) parent.insertBefore(child,drop);
      });
      drop.remove();
      parent.classList.add('bast-flattened-actions');
    });
  }

  function enhanceTables(root=document){
    root.querySelectorAll('table:not([data-bast-responsive])').forEach(table=>{
      table.dataset.bastResponsive='1';
      const headers = Array.from(table.querySelectorAll('thead th')).map(th=>th.textContent.replace(/\s+/g,' ').trim());
      const isEditable = !!table.querySelector('input,select,textarea');
      const isDocument = table.matches('.doc-table,.meta-table,.article-table');
      if (!isEditable && !isDocument && headers.length > 0 && headers.length <= 6) {
        table.classList.add('bast-responsive-table');
        table.querySelectorAll('tbody tr').forEach(row=>{
          Array.from(row.children).forEach((cell,index)=>{
            if (!cell.dataset.label) cell.dataset.label=headers[index] || '';
          });
        });
      }
      const wrapper = table.closest('.table-wrap,.doc-table-wrap,.global-table-wrap');
      if (wrapper && !wrapper.hasAttribute('tabindex')) {
        wrapper.tabIndex=0;
        wrapper.setAttribute('role','region');
        wrapper.setAttribute('aria-label','Tableau défilable');
      }
      if (wrapper && !wrapper.closest('.modal,.modal-backdrop,.sheet,.drive-modal,.mail-preview-modal,.document-photo-viewer') && !wrapper.matches('.doc-table-wrap,.meta-table-wrap')) {
        const width = wrapper.getBoundingClientRect().width;
        if (wrapper.matches('.global-table-wrap') || width >= window.innerWidth * .55) wrapper.classList.add('bast-page-table');
      }
    });
  }

  function sizePageTables(){
    document.querySelectorAll('.bast-page-table').forEach(wrapper=>{
      if (!wrapper.offsetParent) return;
      const top = wrapper.getBoundingClientRect().top;
      const available = Math.max(280, Math.floor(window.innerHeight - Math.max(0, top) - 26));
      wrapper.style.setProperty('--bast-table-page-height',available+'px');
    });
  }

  function process(root=document){
    flattenTopbarDropdowns(root);
    root.querySelectorAll('button,label.file-label').forEach(iconify);
    enhanceTables(root);
    requestAnimationFrame(sizePageTables);
  }

  let queued=false;
  function queueProcess(){
    if (queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;process(document);});
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>process(document));
  else process(document);

  document.addEventListener('pointerover',event=>positionTooltip(event.target.closest?.('.bast-action-icon,.has-tooltip')));
  document.addEventListener('focusin',event=>positionTooltip(event.target.closest?.('.bast-action-icon,.has-tooltip')));
  window.addEventListener('resize',()=>requestAnimationFrame(sizePageTables),{passive:true});

  new MutationObserver(queueProcess).observe(document.documentElement,{childList:true,subtree:true});
})();
