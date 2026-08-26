(function () {
  'use strict';

  const keys = window.BastComptaStorageKeys || {};
  const access = readJson(sessionStorage.getItem('bastcompta_subscription_access'), {});
  const hasAccounting = access.accounting === true || access.premium === true;
  const documents = readJson(localStorage.getItem(keys.documents || 'devis-facture-style-vrai-document'), {});
  const accounting = hasAccounting ? readJson(localStorage.getItem(keys.accounting || 'comptabilite-local-v1'), {}) : {};
  const clients = readJson(localStorage.getItem(keys.clients || 'bastcompta-chantiers-v1'), {});

  function readJson(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function number(value) { const parsed = Number(String(value ?? 0).replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }
  function money(value) { return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(number(value)); }
  function linesTotal(doc) {
    const total = [...(doc?.lines || []), ...(doc?.suppliesEnabled ? doc?.suppliesLines || [] : [])].reduce((sum, line) => {
      const base = number(line.qty) * number(line.unitPrice) * (1 - number(line.discount) / 100);
      return sum + base * (1 + number(line.vatRate) / 100);
    }, 0);
    return Math.round(total * 100) / 100;
  }
  function allLinked(name) {
    const projects = Array.isArray(clients) ? clients : (clients.projects || clients.chantiers || []);
    return projects.flatMap(project => Array.isArray(project?.[name]) ? project[name] : []);
  }
  function currentDocument(type) {
    const doc = documents?.[type];
    return doc?.documentNumber ? [{ ...doc, tvac: linesTotal(doc), type }] : [];
  }
  function uniqueDocs(items) {
    const seen = new Set();
    return items.filter(item => { const id = String(item.id || item.fileId || item.documentNumber || item.ref || Math.random()); if (seen.has(id)) return false; seen.add(id); return true; });
  }
  function docAmount(doc) { return number(doc.tvac ?? doc.amount ?? doc.totalTTC ?? doc.total); }
  function isPaid(doc) { return doc.status === 'paid' || (docAmount(doc) > 0 && number(doc.paidAmount) >= docAmount(doc)); }
  function isLate(doc) { if (isPaid(doc) || !doc.dueDate) return false; const date = new Date(doc.dueDate); return !Number.isNaN(date.getTime()) && date < new Date(new Date().toDateString()); }

  const quotes = uniqueDocs([...allLinked('linkedQuotes'), ...currentDocument('quote')]);
  const invoices = uniqueDocs([...allLinked('linkedInvoices'), ...currentDocument('invoice')]);
  const unpaid = invoices.filter(doc => !isPaid(doc));
  const late = unpaid.filter(isLate);
  const billed = invoices.reduce((sum, doc) => sum + docAmount(doc), 0);
  const outstanding = unpaid.reduce((sum, doc) => sum + Math.max(0, docAmount(doc) - number(doc.paidAmount)), 0);

  function metric(label, value, detail, options = {}) {
    return `<article class="metric-card ${options.tone || ''}" data-tab="${options.tab || 'devis'}" data-page="${options.page || 'invoice'}"><span class="metric-label">${label}</span><strong class="metric-value">${value}</strong><span class="metric-detail">${detail}</span></article>`;
  }
  function lockedMetric(label, detail) {
    return `<article class="metric-card locked"><span class="lock-icon">🔒</span><span class="metric-label">${label}</span><span class="metric-detail">${detail}</span><button class="unlock-button" data-subscription type="button">Découvrir</button></article>`;
  }
  function renderCommercial() {
    document.getElementById('commercialMetrics').innerHTML = [
      metric('Total facturé', money(billed), `${invoices.length} facture${invoices.length === 1 ? '' : 's'} enregistrée${invoices.length === 1 ? '' : 's'}`),
      metric('À encaisser', money(outstanding), `${unpaid.length} facture${unpaid.length === 1 ? '' : 's'} non soldée${unpaid.length === 1 ? '' : 's'}`, { tone: outstanding ? 'warning' : 'good' }),
      metric('Factures en retard', String(late.length), late.length ? 'Une relance peut être nécessaire' : 'Aucun retard détecté', { tone: late.length ? 'warning' : 'good', page: 'reminder' }),
      metric('Devis suivis', String(quotes.length), 'Devis courants et liés aux clients', { page: 'quote' })
    ].join('');
  }
  function sumRows(rows, fields) { return (rows || []).reduce((sum, row) => sum + number(fields.map(field => row?.[field]).find(value => value !== undefined)), 0); }
  function renderAccounting() {
    const root = document.getElementById('accountingMetrics');
    if (!hasAccounting) {
      root.innerHTML = [
        lockedMetric('Résultat estimé', 'Revenus et charges de l’exercice.'),
        lockedMetric('Achats et frais', 'Suivi des dépenses professionnelles.'),
        lockedMetric('Situation TVA', 'TVA due, déductible et déclarations.'),
        lockedMetric('Trésorerie', 'Banque et caisse de votre activité.')
      ].join('');
      document.querySelectorAll('.accounting-link').forEach(el => el.textContent = 'Découvrir le pack →');
      return;
    }
    const sales = sumRows(accounting.sales, ['totalExcl', 'amountExcl', 'htva', 'amount']);
    const purchases = sumRows(accounting.purchases, ['professionalCost', 'totalExcl', 'amountExcl', 'amount']);
    const losses = sumRows(accounting.losses, ['amount', 'total']);
    const result = sales - purchases - losses;
    const declarations = accounting.vat?.declarations || [];
    const openVat = declarations.filter(item => !item.closed && item.status !== 'closed');
    const treasury = number(accounting.settings?.bankBalance) + number(accounting.settings?.cashBalance);
    root.innerHTML = [
      metric('Résultat estimé', money(result), 'Ventes moins achats et charges', { tone: result >= 0 ? 'good' : 'warning', tab: 'compta', page: 'result' }),
      metric('Achats et frais', money(purchases + losses), 'Montants de l’exercice', { tab: 'compta', page: 'purchases' }),
      metric('Déclarations TVA ouvertes', String(openVat.length), declarations.length ? `${declarations.length} déclaration${declarations.length === 1 ? '' : 's'} au total` : 'Aucune déclaration enregistrée', { tab: 'compta', page: 'vat' }),
      metric('Trésorerie renseignée', money(treasury), 'Solde banque et caisse', { tab: 'compta', page: 'balance' })
    ].join('');
  }
  function listRow(title, detail, tone, tab, page) { return `<div class="list-row"><span class="status-dot ${tone}"></span><div class="list-copy"><strong>${title}</strong><span>${detail}</span></div>${tab ? `<button data-tab="${tab}" data-page="${page}" type="button">Voir</button>` : ''}</div>`; }
  function renderPriorities() {
    const items = [];
    if (late.length) items.push(listRow(`${late.length} facture${late.length === 1 ? '' : 's'} en retard`, `${money(outstanding)} restent à vérifier ou encaisser.`, 'warning', 'devis', 'reminder'));
    if (documents.quote?.documentNumber) items.push(listRow(`Devis ${documents.quote.documentNumber}`, 'Le document courant est prêt à être repris.', '', 'devis', 'quote'));
    if (hasAccounting && !(accounting.vat?.declarations || []).length) items.push(listRow('Aucune déclaration TVA', 'Vous pouvez préparer votre première période.', '', 'compta', 'vat'));
    document.getElementById('priorityList').innerHTML = items.join('') || '<div class="empty-state">Aucune priorité détectée pour le moment.</div>';
  }
  function renderStatus() {
    const lastSave = localStorage.getItem(keys.documentsLastSave || 'devis-facture-style-vrai-document-last-save');
    const driveExpected = localStorage.getItem(keys.googleWasConnected || 'bastcompta_google_was_connected') === '1';
    const saveText = lastSave ? new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastSave)) : 'Pas encore enregistrée';
    document.getElementById('dataStatus').innerHTML = [
      listRow('Données commerciales', `Dernière sauvegarde : ${saveText}`, lastSave ? 'good' : ''),
      listRow('Google Drive', driveExpected ? 'Connexion configurée dans le portail' : 'Non connecté', driveExpected ? 'good' : 'warning'),
      listRow('Accès comptabilité', hasAccounting ? 'Pack actif' : 'Module verrouillé', hasAccounting ? 'good' : '')
    ].join('');
  }
  function navigate(tab, page) { window.parent.postMessage({ type: 'BASTCOMPTA_DASHBOARD_NAVIGATE', tab, page }, window.location.origin); }
  function bindActions() {
    document.body.addEventListener('click', event => {
      const subscription = event.target.closest('[data-subscription]');
      if (subscription) return window.parent.postMessage({ type: 'BASTCOMPTA_OPEN_SUBSCRIPTION' }, window.location.origin);
      const target = event.target.closest('[data-tab]');
      if (!target) return;
      if (target.dataset.pack === 'accounting' && !hasAccounting) return window.parent.postMessage({ type: 'BASTCOMPTA_OPEN_SUBSCRIPTION' }, window.location.origin);
      navigate(target.dataset.tab, target.dataset.page || '');
    });
    document.getElementById('refreshDashboard').addEventListener('click', () => location.reload());
  }
  function init() {
    renderCommercial(); renderAccounting(); renderPriorities(); renderStatus(); bindActions();
    if (!hasAccounting) document.querySelector('.premium-action')?.classList.add('locked');
  }
  init();
})();
