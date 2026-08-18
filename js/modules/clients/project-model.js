/* BastCompta - normalisation et fusion des suivis clients. */
(function (global) {
  'use strict';
  const normalizeKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function clientKey(project = {}, createId = () => '') {
    const id = String(project.clientId || '').trim(), ref = String(project.clientRef || '').trim();
    if (id) return `id:${id}`; if (ref) return `ref:${normalizeKey(ref)}`;
    return `project:${project.id || createId()}`;
  }
  function dedupeMoneyList(list = []) {
    const map = new Map();
    for (const item of Array.isArray(list) ? list : []) {
      const type = String(item.docKey || item.type || '').trim();
      const ref = normalizeKey(item.ref || item.documentNumber || item.invoiceNumber);
      let key = type && ref && ['quote','invoice','reminder'].includes(type) ? `${type}:${ref}` : '';
      if (!key && ref && String(item.description || '').toLowerCase().includes('facture')) key = `invoice:${ref}`;
      key ||= String(item.documentUid || item.fileId || item.driveFileId || item.id || '').trim();
      if (key) map.set(key, { ...(map.get(key) || {}), ...item, documentUid: key });
    }
    return [...map.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }
  function normalize(project = {}, options = {}) {
    const clientName = project.clientName || project.title || '', now = options.now?.() || new Date().toISOString();
    return { id: project.id || options.createId?.() || '', title: clientName, clientId: project.clientId || '', clientName,
      clientRef: project.clientRef || '', address: project.address || '', description: project.description || '',
      status: project.status || 'planned', startDate: project.startDate || '', endDate: project.endDate || '',
      createdAt: project.createdAt || now, updatedAt: project.updatedAt || now, quoteAmount: Number(project.quoteAmount) || 0,
      linkedQuotes: dedupeMoneyList(project.linkedQuotes), linkedInvoices: dedupeMoneyList(project.linkedInvoices),
      linkedReminders: dedupeMoneyList(project.linkedReminders), costs: dedupeMoneyList(project.costs),
      documents: Array.isArray(project.documents) ? project.documents : [], tasks: Array.isArray(project.tasks) ? project.tasks : [],
      notes: Array.isArray(project.notes) ? project.notes : [], timeline: Array.isArray(project.timeline) ? project.timeline : [] };
  }
  function merge(projects = [], options = {}) {
    const map = new Map();
    for (const project of projects) {
      const key = clientKey(project, options.createId); if (!map.has(key)) { map.set(key, project); continue; }
      const target = map.get(key); target.title = target.clientName || target.title || project.clientName || project.title || '';
      for (const field of ['clientId','clientName','clientRef','address','endDate']) target[field] ||= project[field] || '';
      target.description = [target.description, project.description].filter(Boolean).join(target.description && project.description ? '\n' : '');
      target.startDate = [target.startDate, project.startDate].filter(Boolean).sort()[0] || '';
      target.createdAt = [target.createdAt, project.createdAt].filter(Boolean).sort()[0] || options.now?.() || '';
      target.updatedAt = [target.updatedAt, project.updatedAt].filter(Boolean).sort().pop() || options.now?.() || '';
      for (const field of ['linkedQuotes','linkedInvoices','linkedReminders','costs','documents']) target[field] = dedupeMoneyList([...(target[field] || []), ...(project[field] || [])]);
      for (const field of ['tasks','notes']) target[field] = [...(target[field] || []), ...(project[field] || [])];
      target.timeline = [...(target.timeline || []), ...(project.timeline || [])].slice(0, 120);
    }
    return [...map.values()];
  }
  function normalizeData(source = {}, options = {}) {
    const data = { version: 2, ...source };
    data.projects = merge((Array.isArray(data.projects) ? data.projects : []).map(project => normalize(project, options)), options);
    return data;
  }
  global.BastProjectModel = Object.freeze({ normalizeKey, clientKey, dedupeMoneyList, normalize, merge, normalizeData });
})(globalThis);
