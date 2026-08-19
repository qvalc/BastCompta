/* BastCompta - composants de présentation du suivi TVA. */
(function (global) {
  'use strict';

  function exemptPage(active = false) {
    return `<section class="page ${active ? 'active' : ''}"><div class="card"><h2>TVA</h2><div class="muted-box" style="margin-top:14px;"><strong>Activité exonérée de TVA – article 44.</strong><br>BastCompta ne prépare pas de déclaration périodique Intervat pour ce régime. Les ventes sont enregistrées sans TVA et la TVA des achats est intégrée dans leur coût professionnel.</div></div></section>`;
  }

  function overview(ledger = {}, money = String) {
    const unfiled = (ledger.totalUnfiledDue || 0) - (ledger.totalUnfiledCredit || 0);
    return `<div class="summary-grid" style="margin-bottom:16px;">
      <div class="card"><div class="metric-label">Report initial TVA</div><div class="metric-value">${money(ledger.initialCredit || 0)}</div></div>
      <div class="card"><div class="metric-label">TVA non déclarée</div><div class="metric-value">${money(unfiled)}</div></div>
      <div class="card"><div class="metric-label">Déclarée mais non payée</div><div class="metric-value">${money(ledger.totalFiledUnpaid || 0)}</div></div>
      <div class="card"><div class="metric-label">Solde TVA ouvert</div><div class="metric-value">${money(ledger.totalDueOpen || 0)}</div></div>
    </div>`;
  }

  function declarationView(row = {}, format = {}) {
    const dec = row.declaration || {}, computed = row.computed || {};
    const money = format.money || String, number = global.BastAccountingCalculations.number;
    let netLabel = 'TVA équilibrée', netLabelClass = 'status-good', paymentBadge = '<span class="vat-pill muted">TVA équilibrée</span>';
    if (computed.dueAmount > 0) {
      if (row.outstanding <= 0.009) {
        netLabel = `Payée : ${money(computed.dueAmount)}`;
        paymentBadge = '<span class="vat-pill success">Payée</span>';
      } else if (number(dec.paymentAmount) > 0) {
        netLabel = `Solde restant : ${money(row.outstanding)}`;
        netLabelClass = 'status-bad';
        paymentBadge = '<span class="vat-pill danger">Solde TVA restant</span>';
      } else {
        netLabel = `À payer : ${money(computed.dueAmount)}`;
        netLabelClass = 'status-bad';
        paymentBadge = '<span class="vat-pill danger">TVA à payer</span>';
      }
    } else if (computed.creditAmount > 0) {
      netLabel = dec.reimbursementRequested ? `Remboursement demandé : ${money(computed.creditAmount)}` : `Crédit à reporter : ${money(computed.creditAmount)}`;
      paymentBadge = dec.reimbursementRequested ? '<span class="vat-pill success">Remboursement demandé</span>' : '<span class="vat-pill">Crédit à reporter</span>';
    }
    return {
      isClosed: !!dec.closed,
      disableAttr: dec.closed ? 'disabled' : '',
      netLabel,
      netLabelClass,
      dueDateLabel: dec.dueDate ? format.date(dec.dueDate) : '—',
      statusBadge: dec.closed ? '<span class="vat-pill success">Clôturé</span>'
        : (dec.filed ? '<span class="vat-pill">Déclarée</span>' : '<span class="vat-pill muted">À déclarer</span>'),
      paymentBadge,
      situationText: format.situation(dec, computed, row.outstanding)
    };
  }

  function miniSummary(boxes = {}, money = String) {
    return `<div class="vat-summary-details">${['54', '59', '71', '72'].map(code => `<div class="vat-mini-box"><div class="vat-mini-label">Grille ${code}</div><div class="vat-mini-value">${money(boxes[code])}</div></div>`).join('')}</div>`;
  }

  function primaryCodes(boxes = {}, money = String) {
    const definitions = [['01', 'Opérations à 6 %'], ['02', 'Opérations à 12 %'], ['03', 'Opérations à 21 %'],
      ['54', 'TVA due sur ventes encodées'], ['59', 'TVA déductible sur achats'], ['71', 'TVA à payer'], ['72', 'Crédit TVA à reporter']];
    return `<div class="vat-primary-codes" style="overflow:auto;"><table class="vat-code-table"><thead><tr><th>Grille</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${definitions.map(([code, label]) => `<tr><td>${code}</td><td>${label}</td><td>${money(boxes[code])}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function extraCodes(dec = {}, computed = {}, index, format = {}) {
    const num = format.num || String, attr = format.attr || String, money = format.money || String;
    const disabled = dec.closed ? 'disabled' : '';
    const definitions = [
      ['44', 'Prestations/services particuliers'], ['46', 'Livraisons intracom / opérations assimilées'],
      ['47', 'Autres opérations exemptées'], ['48', 'Notes de crédit sur opérations antérieures'],
      ['49', 'Autres opérations sans TVA belge'], ['55', 'TVA due acquisitions intracom / autoliquidation'],
      ['56', 'TVA due opérations cocontractant'], ['57', 'TVA importations / autres régularisations dues'],
      ['61', 'Régularisations TVA en faveur de l’État'], ['62', 'Régularisations TVA en votre faveur'],
      ['63', 'Crédit antérieur / autres TVA déductibles']
    ];
    const editableRows = definitions.map(([code, label]) => `<tr><td>${code}</td><td>${label}</td><td><input type="number" step="0.01" value="${num(dec.manualBoxes?.[code])}" ${disabled} onchange="data.vat.declarations[${index}].manualBoxes['${code}']=parseFloat(this.value)||0; saveData(false)"></td></tr>`).join('');
    return `<div class="vat-extra-codes"><button type="button" class="vat-extra-toggle" ${disabled} onclick="toggleVatExtraCodes('${attr(dec.id)}')"><span>Plus de codes</span><span>${dec.showExtraCodes ? '▲' : '▼'}</span></button>
      <div class="vat-extra-body ${dec.showExtraCodes ? 'open' : ''}"><div style="overflow:auto;"><table class="vat-code-table"><thead><tr><th>Grille</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${editableRows}
      <tr><td>81</td><td>Achats marchandises / matières</td><td>${money(computed.boxes?.['81'])}</td></tr>
      <tr><td>82</td><td>Services, biens divers et autres</td><td>${money(computed.boxes?.['82'])}</td></tr>
      <tr><td>83</td><td>Biens d’investissement</td><td><input type="number" step="0.01" value="${num(computed.boxes?.['83'])}" ${disabled} onchange="data.vat.declarations[${index}].manualBoxes['83']=parseFloat(this.value)||0; saveData(false)"></td></tr>
      <tr><td>91</td><td>Acompte de décembre (si applicable)</td><td><input type="number" step="0.01" value="${num(dec.manualBoxes?.['91'])}" ${disabled} onchange="data.vat.declarations[${index}].manualBoxes['91']=parseFloat(this.value)||0; saveData(false)"></td></tr>
      </tbody></table></div></div></div>`;
  }

  function declarationForm(dec = {}, index, format = {}) {
    const attr = format.attr || String, num = format.num || String, disabled = dec.closed ? 'disabled' : '';
    const quarter = parseInt(dec.quarter, 10);
    return `<div><table><tbody>
      <tr><td>Année</td><td><input type="number" step="1" value="${attr(dec.year)}" ${disabled} onchange="data.vat.declarations[${index}].year=parseInt(this.value,10)||new Date().getFullYear(); syncVatDeclarationPeriod(${index})"></td></tr>
      <tr><td>Trimestre</td><td><select ${disabled} onchange="data.vat.declarations[${index}].quarter=parseInt(this.value,10)||1; syncVatDeclarationPeriod(${index})">
      ${[[1, 'T1 (janvier à mars)'], [2, 'T2 (avril à juin)'], [3, 'T3 (juillet à septembre)'], [4, 'T4 (octobre à décembre)']].map(([value, label]) => `<option value="${value}" ${quarter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td></tr>
      <tr><td>Date limite</td><td><input type="date" value="${attr(dec.dueDate || '')}" ${disabled} onchange="data.vat.declarations[${index}].dueDate=this.value; saveData(false)"></td></tr>
      <tr><td>Déclaration déposée</td><td><select ${disabled} onchange="data.vat.declarations[${index}].filed=this.value==='true'; saveData(false)"><option value="false" ${!dec.filed ? 'selected' : ''}>Non</option><option value="true" ${dec.filed ? 'selected' : ''}>Oui</option></select></td></tr>
      <tr><td>Date dépôt</td><td><input type="date" value="${attr(dec.filedDate || '')}" ${disabled} onchange="data.vat.declarations[${index}].filedDate=this.value; saveData(false)"></td></tr>
      <tr><td>Paiement effectué</td><td><select ${disabled} onchange="data.vat.declarations[${index}].paid=this.value==='true'; saveData(false)"><option value="false" ${!dec.paid ? 'selected' : ''}>Non</option><option value="true" ${dec.paid ? 'selected' : ''}>Oui</option></select></td></tr>
      <tr><td>Date paiement</td><td><input type="date" value="${attr(dec.paidDate || '')}" ${disabled} onchange="data.vat.declarations[${index}].paidDate=this.value; saveData(false)"></td></tr>
      <tr><td>Montant payé</td><td><input type="number" step="0.01" value="${num(dec.paymentAmount)}" ${disabled} onchange="data.vat.declarations[${index}].paymentAmount=parseFloat(this.value)||0; saveData(false)"></td></tr>
      <tr><td>Demande de remboursement</td><td><select ${disabled} onchange="data.vat.declarations[${index}].reimbursementRequested=this.value==='true'; saveData(false)"><option value="false" ${!dec.reimbursementRequested ? 'selected' : ''}>Non</option><option value="true" ${dec.reimbursementRequested ? 'selected' : ''}>Oui</option></select></td></tr>
      <tr><td>Clôturé</td><td><label style="display:flex; align-items:center; gap:10px;"><input type="checkbox" style="width:auto;" ${dec.closed ? 'checked' : ''} onchange="setVatClosed(${index}, this.checked)"><span>${dec.closed ? 'Oui — période verrouillée, décoche pour modifier à nouveau' : 'Coche pour verrouiller la période'}</span></label></td></tr>
      </tbody></table>${dec.closed ? '<div class="lock-note">Cette période est clôturée. Décoche la case « Clôturé » pour la déverrouiller et modifier à nouveau les champs.</div>' : ''}</div>`;
  }

  function calculationSummary(row = {}, money = String) {
    const c = row.computed || {};
    const entries = [['TVA ventes', c.salesVat], ['TVA achats déductible', c.deductibleVat],
      ['Crédit reporté période précédente', c.previousCredit], ['Solde déclaration (grille 71)', c.boxes?.['71']],
      ['Crédit à reporter (grille 72)', c.boxes?.['72']]];
    return `<div><table><tbody>${entries.map(([label, value]) => `<tr><td>${label}</td><td>${money(value)}</td></tr>`).join('')}
      <tr><td>Reste à payer</td><td class="${row.outstanding > 0.009 ? 'status-bad' : 'status-good'}">${money(row.outstanding)}</td></tr>
      <tr><td>Lignes ventes prises en compte</td><td>${c.salesCount}</td></tr><tr><td>Lignes achats prises en compte</td><td>${c.purchaseCount}</td></tr>
      </tbody></table></div>`;
  }

  global.BastVatUi = Object.freeze({ exemptPage, overview, declarationView, miniSummary, primaryCodes, extraCodes,
    declarationForm, calculationSummary });
})(globalThis);
