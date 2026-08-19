/* BastCompta - composants et styles du rapport comptable imprimable. */
(function (global) {
  'use strict';

  const styles = `
  :root { --ink:#172033; --muted:#5c667a; --line:#d7deea; --soft:#f6f8fc; --soft-2:#edf2fb; --accent:#1d4ed8; --good:#166534; --bad:#b91c1c; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#eef3f9; color:var(--ink); font-family:Arial,Helvetica,sans-serif; }
  body { padding:24px; }
  .report { max-width:1180px; margin:0 auto; background:#fff; padding:28px; border-radius:20px; box-shadow:0 18px 50px rgba(15,23,42,.08); }
  .report-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding-bottom:20px; border-bottom:2px solid var(--soft-2); margin-bottom:20px; }
  .report-header h1 { margin:0 0 6px; font-size:30px; }
  .report-subtitle { color:var(--muted); line-height:1.5; }
  .report-meta { min-width:270px; background:var(--soft); border:1px solid var(--line); border-radius:16px; padding:16px; }
  .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin:22px 0 26px; }
  .metric { border:1px solid var(--line); background:var(--soft); border-radius:16px; padding:16px; }
  .metric span { display:block; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; }
  .metric strong { font-size:24px; }
  .section { margin-top:22px; page-break-inside:avoid; }
  .section-title { font-size:21px; margin:0 0 12px; padding-bottom:8px; border-bottom:2px solid var(--soft-2); }
  .section-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
  .panel { border:1px solid var(--line); border-radius:16px; background:#fff; overflow:hidden; }
  .panel.soft { background:var(--soft); }
  .panel-body { padding:16px; }
  .table-wrap { overflow:hidden; border:1px solid var(--line); border-radius:16px; }
  table.report-table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .report-table th { background:var(--soft-2); color:var(--muted); text-transform:uppercase; letter-spacing:.03em; font-size:11px; padding:10px 8px; text-align:center; border-bottom:1px solid var(--line); }
  .report-table td { border-bottom:1px solid var(--line); padding:8px; vertical-align:top; }
  .report-table tbody tr:nth-child(even) td { background:#fbfcfe; }
  .report-table td:nth-child(1), .report-table td:nth-last-child(1) { white-space:nowrap; }
  .report-table.compact td, .report-table.compact th { padding:7px 8px; }
  .empty-row { text-align:center; color:var(--muted); padding:14px; }
  .report-kv { border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .report-kv-row { display:grid; grid-template-columns:1fr auto; gap:16px; padding:11px 14px; border-bottom:1px solid var(--line); }
  .report-kv-row:last-child { border-bottom:none; }
  .totals-grid { display:grid; grid-template-columns:1.2fr .8fr; gap:16px; }
  .result-card { border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .result-card .row { display:grid; grid-template-columns:1fr 220px; }
  .result-card .row > div { padding:12px 14px; border-bottom:1px solid var(--line); }
  .result-card .row > div:last-child { text-align:right; font-weight:700; border-left:1px solid var(--line); }
  .result-card .row.total > div { background:#fff7bf; font-size:18px; }
  .muted { color:var(--muted); } .good { color:var(--good); } .bad { color:var(--bad); }
  .footer-note { margin-top:20px; color:var(--muted); font-size:12px; text-align:center; }
  .print-toolbar { position:sticky; top:0; z-index:20; display:flex; justify-content:flex-end; gap:10px; margin-bottom:18px; }
  .print-toolbar button { border:none; background:var(--accent); color:#fff; padding:12px 16px; border-radius:12px; font-weight:700; cursor:pointer; }
  .print-toolbar button.secondary { background:#e5e7eb; color:#111827; }
  @page { size:A4 landscape; margin:12mm; }
  @media print {
    html,body { background:#fff; } body { padding:0; } .print-toolbar { display:none; }
    .report { box-shadow:none; border-radius:0; max-width:none; padding:0; }
    .section { break-inside:avoid; page-break-inside:avoid; } .table-wrap { overflow:visible; }
    table.report-table { font-size:10.5px; } .report-table th,.report-table td { padding:6px 5px; }
    .report-table thead { display:table-header-group; } .report-table tr { break-inside:avoid; }
    .metrics { gap:8px; } .metric { padding:10px; } .metric strong { font-size:18px; }
  }
  @media (max-width:980px) {
    .metrics,.section-grid,.totals-grid { grid-template-columns:1fr; }
    .report-header { flex-direction:column; } .report-meta { min-width:0; width:100%; }
  }`;

  function date(value, escape = String) {
    if (!value) return '—';
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? escape(value) : new Intl.DateTimeFormat('fr-BE').format(parsed);
  }

  function table(headers = [], rows = [], options = {}) {
    const className = options.compact ? 'report-table compact' : 'report-table';
    const body = rows.length
      ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}" class="empty-row">Aucune donnée</td></tr>`;
    return `<div class="table-wrap"><table class="${className}"><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function keyValues(items = []) {
    return `<div class="report-kv">${items.map(([label, value]) => `<div class="report-kv-row"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`;
  }

  function documentStart({ title, companyName, period, generatedAt, purchaseCount = 0, salesCount = 0, metrics = [] } = {}) {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>${styles}</style></head><body>
      <div class="print-toolbar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button><button class="secondary" onclick="window.close()">Fermer</button></div>
      <div class="report"><div class="report-header"><div><h1>Comptabilité – ${companyName}</h1><div class="report-subtitle">Export complet de tous les onglets, optimisé pour une impression propre en A4 paysage.</div></div>
      <div class="report-meta"><div><strong>Période :</strong> ${period}</div><div><strong>Date d’export :</strong> ${generatedAt}</div><div><strong>Lignes achats :</strong> ${purchaseCount}</div><div><strong>Lignes ventes :</strong> ${salesCount}</div></div></div>
      <div class="metrics">${metrics.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`;
  }

  const documentEnd = () => '<div class="footer-note">Export généré depuis l’application locale Bast Aménagement.</div></div></body></html>';
  const section = (title, content) => `<section class="section"><h2 class="section-title">${title}</h2>${content}</section>`;
  const panel = (content, soft = false) => `<div class="panel${soft ? ' soft' : ''}"><div class="panel-body">${content}</div></div>`;
  const grid = content => `<div class="section-grid">${content}</div>`;
  function tableSection(title, headers, rows, options = {}, footerItems = []) {
    const footer = footerItems.length ? `<div style="margin-top:12px;">${keyValues(footerItems)}</div>` : '';
    return section(title, table(headers, rows, options) + footer);
  }
  function keyValueGridSection(title, leftItems, rightItems, options = {}) {
    return section(title, grid(panel(keyValues(leftItems), !!options.soft) + panel(keyValues(rightItems), !!options.soft)));
  }
  function resultSection(rows = [], informationItems = []) {
    const resultRows = rows.map(row => `<div class="row${row.total ? ' total' : ''}"><div>${row.label}</div><div>${row.value}</div></div>`).join('');
    return section('Compte de résultat', `<div class="totals-grid"><div class="result-card">${resultRows}</div>${panel(keyValues(informationItems), true)}</div>`);
  }

  global.BastAccountingReportTemplate = Object.freeze({ styles, date, table, keyValues, documentStart, documentEnd,
    section, panel, grid, tableSection, keyValueGridSection, resultSection });
})(globalThis);
