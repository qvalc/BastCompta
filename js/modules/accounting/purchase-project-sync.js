/* BastCompta - synchronisation pure des achats vers les suivis clients. */
(function (global) {
  'use strict';

  function slug(value, fallback = 'chantier') {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
  }
  const defaultId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function ensurePurchaseIds(purchases = [], idFactory = defaultId) {
    let changed = false;
    purchases.forEach(row => {
      if (!row._id) { row._id = idFactory('purchase'); changed = true; }
    });
    return changed;
  }

  function sortedProjects(projects = []) {
    return projects.slice().sort((a, b) => `${a.clientName || ''} ${a.title || ''}`
      .localeCompare(`${b.clientName || ''} ${b.title || ''}`, 'fr', { sensitivity: 'base' }));
  }
  const projectLabel = project => `${project?.clientName || 'Client'} — ${project?.title || 'Chantier'}`;

  function assignProject(row, project) {
    if (!row) return row;
    row.chantierId = project?.id || '';
    row.chantierClientId = project?.clientId || '';
    row.chantierClientName = project?.clientName || '';
    row.chantierSiteName = project?.title || '';
    return row;
  }

  function findOrCreate(chantiersData, row, { now = () => new Date().toISOString(), idFactory = defaultId } = {}) {
    const title = String(row.chantierSiteName || '').trim();
    if (!title) return null;
    const projects = chantiersData.projects || (chantiersData.projects = []);
    const clientName = String(row.chantierClientName || '').trim();
    const titleKey = slug(title), clientKey = slug(clientName, '');
    let project = row.chantierId ? projects.find(item => String(item.id || '') === String(row.chantierId)) : null;
    const candidates = projects.filter(item => slug(item.title) === titleKey);
    if (!project) project = clientName
      ? candidates.find(item => slug(item.clientName || item.clientRef, '') === clientKey)
      : (candidates.length === 1 ? candidates[0] : null);
    if (!project) {
      const timestamp = now();
      project = {
        id: idFactory(`chantier-${clientKey || 'client'}-${titleKey}`), title,
        clientId: row.chantierClientId || '', clientName, clientRef: '', address: '', description: '', status: 'active',
        startDate: row.date || '', endDate: '', createdAt: timestamp, updatedAt: timestamp, quoteAmount: 0,
        linkedQuotes: [], linkedInvoices: [], linkedReminders: [], costs: [], documents: [], tasks: [], notes: [], timeline: []
      };
      projects.unshift(project);
    }
    ['costs', 'timeline', 'documents'].forEach(key => { if (!Array.isArray(project[key])) project[key] = []; });
    project.clientId = project.clientId || row.chantierClientId || '';
    project.clientName = project.clientName || clientName;
    row.chantierId = project.id;
    return project;
  }

  function upsertCost(project, row) {
    const calc = global.BastAccountingCalculations;
    const rowId = row._id || `${row.date || ''}-${row.supplier || ''}-${row.invoiceNumber || ''}-${row.htva || 0}`;
    const costId = `purchase-${rowId}`;
    let item = project.costs.find(cost => String(cost.id || '') === costId);
    if (!item) { item = { id: costId }; project.costs.push(item); }
    const htva = calc.round2(row.htva), vat = row.deductible ? calc.purchaseVat(row) : 0;
    Object.assign(item, {
      date: row.date || '', ref: row.invoiceNumber || row.supplier || 'Achat',
      description: `${row.supplier || 'Achat'}${row.invoiceNumber ? ' • ' + row.invoiceNumber : ''}`,
      amount: htva, htva, vat, tvac: calc.round2(calc.tvacFromHtva(row.htva, row.rate)),
      category: row.category || 'frais_generaux', supplier: row.supplier || '', source: 'comptabilite', purchaseId: rowId,
      chantierId: project.id, clientId: row.chantierClientId || project.clientId || '',
      pdfFileId: row.pdfFileId || '', pdfFileName: row.pdfFileName || ''
    });
    return item;
  }

  function addTimeline(project, text, { now = () => new Date().toISOString(), idFactory = defaultId } = {}) {
    if (!Array.isArray(project.timeline)) project.timeline = [];
    if (!project.timeline.some(event => event.text === text)) {
      project.timeline.unshift({ id: idFactory('evt'), date: now(), text });
    }
    project.timeline = project.timeline.slice(0, 100);
  }

  function synchronize(chantiersData = {}, purchases = [], options = {}) {
    ensurePurchaseIds(purchases, options.idFactory);
    const projects = chantiersData.projects || (chantiersData.projects = []);
    let changed = false;
    const activeIds = new Set(purchases.map(row => row._id).filter(Boolean).map(id => `purchase-${id}`));
    projects.forEach(project => {
      if (!Array.isArray(project.costs)) project.costs = [];
      const before = project.costs.length;
      project.costs = project.costs.filter(cost => cost.source !== 'comptabilite' || activeIds.has(String(cost.id || '')));
      if (before !== project.costs.length) changed = true;
    });
    purchases.forEach(row => {
      if (!String(row.chantierSiteName || '').trim()) return;
      const project = findOrCreate(chantiersData, row, options);
      if (!project) return;
      upsertCost(project, row);
      project.updatedAt = (options.now || (() => new Date().toISOString()))();
      addTimeline(project, `Achat ${row.invoiceNumber || row.supplier || ''} synchronisé depuis Comptabilité.`, options);
      changed = true;
    });
    return { changed, chantiersData };
  }

  global.BastPurchaseProjectSync = Object.freeze({ slug, ensurePurchaseIds, sortedProjects, projectLabel, assignProject,
    findOrCreate, upsertCost, addTimeline, synchronize });
})(globalThis);
