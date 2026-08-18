/* BastCompta - modele pur des clients CRM. */
(function (global) {
  'use strict';
  const clean = value => String(value ?? '').trim();
  const sanitizeEmail = value => clean(value).replace(/[;,\s]+$/g, '');
  const slug = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  function empty(createId = () => '', now = () => new Date().toISOString()) {
    return { id: createId(), name: '', email: '', address: '', clientNumber: '', vat: '', phone: '', contact: '', notes: '', favorite: false, createdAt: now() };
  }
  function normalize(client = {}, options = {}) {
    const base = empty(options.createId, options.now);
    return { ...base, ...client, id: client.id || base.id, name: clean(client.name), email: sanitizeEmail(client.email),
      address: clean(client.address), clientNumber: clean(client.clientNumber), vat: clean(client.vat), phone: clean(client.phone),
      contact: clean(client.contact), notes: clean(client.notes), favorite: !!client.favorite, createdAt: client.createdAt || base.createdAt };
  }
  function sort(clients = [], options = {}) {
    return clients.map(client => normalize(client, options)).sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      const byNumber = String(a.clientNumber || '999999').localeCompare(String(b.clientNumber || '999999'), 'fr', { numeric: true, sensitivity: 'base' });
      return byNumber || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    });
  }
  function trackingKey(source = {}) {
    const id = clean(source.clientId), reference = clean(source.clientNumber || source.clientRef);
    const name = clean(source.clientName || source.name || source.title);
    return id ? `id:${id}` : reference ? `ref:${slug(reference)}` : `name:${slug(name)}`;
  }
  function matchIdentity(a = {}, b = {}) {
    const aId = clean(a.clientId || a.id), bId = clean(b.clientId || b.id);
    if (aId && bId && aId === bId) return true;
    const aRef = clean(a.clientNumber || a.clientRef), bRef = clean(b.clientNumber || b.clientRef);
    return !!(aRef && bRef && aRef === bRef) || trackingKey(a) === trackingKey(b);
  }
  const label = client => [client?.name || 'Client sans nom', client?.email || '', client?.clientNumber ? `N° ${client.clientNumber}` : ''].filter(Boolean).join(' — ');
  global.BastCrmModel = Object.freeze({ sanitizeEmail, slug, empty, normalize, sort, trackingKey, matchIdentity, label });
})(globalThis);
