(function (global) {
  'use strict';
  const clean = value => String(value ?? '').trim();
  const listFields = Object.freeze(['linkedQuotes','linkedInvoices','linkedReminders','costs','documents','tasks','notes','timeline']);
  function ensureCollections(project = {}) { for (const field of listFields) if (!Array.isArray(project[field])) project[field] = []; return project; }
  function findProject(projects = [], client = {}, trackingKey = global.BastCrmModel.trackingKey) {
    const id = clean(client.clientId || client.id), ref = clean(client.clientNumber || client.clientRef), key = trackingKey(client);
    return projects.find(project => (id && clean(project.clientId) === id) || (ref && clean(project.clientRef) === ref) || trackingKey(project) === key) || null;
  }
  function upsertMoneyItem(list, payload, createId = () => '') {
    const stable = clean(payload.documentUid || payload.id), ref = clean(payload.ref);
    let item = list.find(entry => stable && clean(entry.documentUid || entry.id) === stable);
    if (!item && ref) item = list.find(entry => clean(entry.ref) === ref);
    if (!item) { item = { id: payload.id || stable || createId() }; list.push(item); }
    Object.assign(item, payload, { documentUid: stable || payload.documentUid || payload.id || '' });
    return item;
  }
  function addTimelineEvent(project, text, options = {}) {
    ensureCollections(project);
    if (project.timeline.some(event => event.text === text)) return false;
    project.timeline.unshift({ id: options.createId?.() || '', date: options.now?.() || new Date().toISOString(), text });
    project.timeline = project.timeline.slice(0, 100);
    return true;
  }
  global.BastProjectLinks = Object.freeze({ listFields, ensureCollections, findProject, upsertMoneyItem, addTimelineEvent });
})(globalThis);
