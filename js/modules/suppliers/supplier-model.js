(function (global) {
  'use strict';
  const number = value => Number(String(value ?? '').replace(',', '.')) || 0;
  function normalizeArticle(article = {}, createId = () => '') {
    return { id: article.id || createId(), name: article.name || '', reference: article.reference || '',
      grossPrice: number(article.grossPrice), discountPct: number(article.discountPct), salePrice: number(article.salePrice),
      unit: article.unit || 'p', vatRate: number(article.vatRate) || 21, notes: article.notes || '' };
  }
  function normalizeSupplier(supplier = {}, options = {}) {
    return { id: supplier.id || options.createId?.() || '', name: supplier.name || '', vat: supplier.vat || '',
      contact: supplier.contact || '', email: supplier.email || '', phone: supplier.phone || '', address: supplier.address || '',
      website: supplier.website || '', paymentTerms: supplier.paymentTerms || '', notes: supplier.notes || '',
      articles: (Array.isArray(supplier.articles) ? supplier.articles : []).map(article => normalizeArticle(article, options.createArticleId)) };
  }
  function normalizeData(source, options = {}) {
    const data = { version: 1, updatedAt: options.now?.() || new Date().toISOString(), ...(source && typeof source === 'object' ? source : {}) };
    data.suppliers = (Array.isArray(data.suppliers) ? data.suppliers : []).map(supplier => normalizeSupplier(supplier, options));
    return data;
  }
  const netPrice = article => number(article?.grossPrice) * (1 - number(article?.discountPct) / 100);
  const margin = article => number(article?.salePrice) - netPrice(article);
  global.BastSupplierModel = Object.freeze({ number, normalizeArticle, normalizeSupplier, normalizeData, netPrice, margin });
})(globalThis);
