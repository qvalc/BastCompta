if (new URLSearchParams(window.location.search).get('embedded') === '1') document.body.classList.add('bast-embedded');

const STORAGE_KEY = window.BastComptaStorageKeys?.personnel || 'bastcompta-personnel-v1';
const DRIVE_SYNC_FILE_NAME = 'bastcompta-personnel-sync.json';
let googleAccessToken = null;
let selectedWorkerId = '';
let selectedTab = 'overview';
let selectedPage = 'summary';
let selectedSummaryYear = String(new Date().getFullYear());
let selectedIndicatorFilter = 'total';
let data = loadData();
let driveSaveTimer = null;

const money = BastFormatters.money;
const dateLabel = BastFormatters.date;
const esc = BastFormatters.escapeHtml;
const uid = prefix => BastFileUtils.createId(prefix);
const today = () => new Date().toISOString().slice(0,10);
const num = BastFormatters.number;

function blankData(){ return { version: 1, updatedAt: new Date().toISOString(), workers: [] }; }
function normalizeWorker(w={}){
  return BastWorkerModel.normalize(w,()=>uid('worker'));
}
function normalizeData(source){ return BastWorkerModel.normalizeData(source,{createId:()=>uid('worker'),now:()=>new Date().toISOString()}); }
function loadData(){ return normalizeData(BastFileUtils.parseJson(localStorage.getItem(STORAGE_KEY),null)); }
function saveLocal(detail='Modification du personnel'){
  data.updatedAt=new Date().toISOString(); localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  try{window.parent?.BastComptaPortal?.markChanged?.('personnel',detail);}catch{}
  if(googleAccessToken){ clearTimeout(driveSaveTimer); driveSaveTimer=setTimeout(()=>saveSyncToDrive(false),1000); }
}
function workerName(w){ return `${w.firstName||''} ${w.lastName||''}`.trim() || 'Sans nom'; }
function getWorker(){ return data.workers.find(w=>w.id===selectedWorkerId)||null; }
function recordYear(item){ return BastPersonnelCalculations.recordYear(item); }
function inSelectedYear(item){ return selectedSummaryYear==='all' || recordYear(item)===selectedSummaryYear; }
function daysInclusive(start,end){ return BastPersonnelCalculations.daysInclusive(start,end); }
function salaryCost(s){ return BastPersonnelCalculations.salaryCost(s); }
function bonusCost(b){ return BastPersonnelCalculations.bonusCost(b); }
function isCurrentAbsence(a){ return BastPersonnelCalculations.isCurrentAbsence(a,today()); }
function usedLegalLeave(w, year=selectedSummaryYear){ return BastPersonnelCalculations.usedLegalLeave(w,year); }

function notify(message){ const t=document.getElementById('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.remove('show'),2600); }
function setDriveState(connected){ const el=document.getElementById('driveState'); if(!el)return; el.textContent=`Google Drive : ${connected?'connecté':'non connecté'}`; el.classList.toggle('connected',connected); }

function buildYearOptions(){
  const years=new Set([String(new Date().getFullYear())]);
  data.workers.forEach(w=>['salaries','bonuses','leaves','absences','timeEntries'].forEach(k=>(w[k]||[]).forEach(r=>{const y=recordYear(r);if(/^\d{4}$/.test(y))years.add(y);}))); 
  const sel=document.getElementById('summaryYearFilter'); if(!sel)return;
  sel.innerHTML=[...years].sort((a,b)=>b.localeCompare(a)).map(y=>`<option value="${y}">${y}</option>`).join('')+'<option value="all">Toutes années</option>';
  if(![...sel.options].some(o=>o.value===selectedSummaryYear)) selectedSummaryYear=String(new Date().getFullYear()); sel.value=selectedSummaryYear;
}
function setSummaryYear(value){ selectedSummaryYear=value; renderSummary(); renderCurrentView(); }

function isCurrentLeave(l){ return BastPersonnelCalculations.isCurrentLeave(l,today()); }
function currentLeave(w){ return (w.leaves||[]).find(isCurrentLeave)||null; }
function currentAbsence(w){ return (w.absences||[]).find(isCurrentAbsence)||null; }
function currentPersonnelState(w){
  return BastPersonnelCalculations.currentState(w,today());
}
function indicatorLabel(state){ return ({total:'Tout le personnel',active:'Actifs',leave:'En congé',illness:'En maladie',other:'Autres absences'}[state]||'Travailleurs'); }
function setIndicatorFilter(filter){
  selectedIndicatorFilter=filter;
  selectedPage='workers';
  const status=document.getElementById('workerStatusFilter'); if(status) status.value=filter==='total'?'all':'active';
  selectedWorkerId='';
  renderSummary(); renderWorkerList(); renderCurrentView();
}
function renderSummary(){
  const employed=data.workers.filter(w=>w.active);
  const workers=employed.filter(w=>w.type==='worker').length, employees=employed.filter(w=>w.type==='employee').length;
  const counts={active:0,leave:0,illness:0,other:0};
  employed.forEach(w=>{ const state=currentPersonnelState(w); if(counts[state]!==undefined) counts[state]++; });
  document.getElementById('metricTotal').textContent=employed.length;
  document.getElementById('metricTotalSub').textContent=`${workers} ouvrier${workers!==1?'s':''} · ${employees} employé${employees!==1?'s':''}`;
  document.getElementById('metricActive').textContent=counts.active;
  document.getElementById('metricLeave').textContent=counts.leave;
  document.getElementById('metricIllness').textContent=counts.illness;
  document.getElementById('metricOther').textContent=counts.other;
  ['total','active','leave','illness','other'].forEach(k=>document.getElementById('indicator'+k.charAt(0).toUpperCase()+k.slice(1))?.classList.toggle('selected',selectedIndicatorFilter===k));
}
function renderWorkerList(){
  const q=(document.getElementById('workerSearch')?.value||'').toLowerCase(); const status=document.getElementById('workerStatusFilter')?.value||'active'; const type=document.getElementById('workerTypeFilter')?.value||'all';
  const list=data.workers.filter(w=>{
    if(status==='active'&&!w.active)return false;if(status==='inactive'&&w.active)return false;if(type!=='all'&&w.type!==type)return false;
    if(selectedIndicatorFilter!=='total' && currentPersonnelState(w)!==selectedIndicatorFilter)return false;
    return `${workerName(w)} ${w.functionTitle} ${w.department}`.toLowerCase().includes(q);
  }).sort((a,b)=>workerName(a).localeCompare(workerName(b),'fr'));
  const title=document.getElementById('workerListTitle'); if(title) title.textContent=`${indicatorLabel(selectedIndicatorFilter)} (${list.length})`;
  document.getElementById('workerList').innerHTML=list.length?list.map(w=>{
    const state=currentPersonnelState(w), leave=currentLeave(w), absence=currentAbsence(w);
    const stateHtml=state==='leave'?`<span class="badge warn">En congé</span>${leave?.endDate?`<span>jusqu’au ${dateLabel(leave.endDate)}</span>`:''}`:state==='illness'?`<span class="badge danger">Maladie</span>${absence?.endDate?`<span>jusqu’au ${dateLabel(absence.endDate)}</span>`:''}`:state==='other'?`<span class="badge warn">Autre absence</span>${absence?.endDate?`<span>jusqu’au ${dateLabel(absence.endDate)}</span>`:''}`:state==='active'?'<span class="badge active">Au travail</span>':'<span class="badge inactive">Inactif</span>';
    return `<button class="worker-item ${w.id===selectedWorkerId?'active':''}" onclick="selectWorker('${w.id}')"><div class="worker-name">${esc(workerName(w))}</div><div class="worker-meta">${stateHtml}<span>${w.type==='worker'?'Ouvrier':'Employé'}</span>${w.functionTitle?`<span>· ${esc(w.functionTitle)}</span>`:''}</div></button>`;
  }).join(''):'<div class="empty-state" style="min-height:180px"><div>Aucune personne dans cette catégorie.</div></div>';
}
function setWorkerStatusFilter(){ selectedIndicatorFilter='total'; renderSummary(); renderWorkerList(); }
function selectWorker(id){ selectedWorkerId=id; selectedTab='overview'; selectedPage='worker'; renderWorkerList(); renderCurrentView(); }

const tabLabels={overview:'Résumé',salary:'Salaires',time:'Prestations',leave:'Congés',absence:'Maladies & absences',bonus:'Primes & avantages',document:'Documents',training:'Formations',equipment:'Matériel',history:'Historique'};
function setWorkerTab(tab){ selectedTab=tab; selectedPage='worker'; renderCurrentView(); }
function globalYearMatch(item){
  if(selectedSummaryYear==='all') return true;
  const raw=item.date||item.startDate||item.month||item.obtainedDate||item.assignedDate||item.expiryDate||'';
  return String(raw).slice(0,4)===selectedSummaryYear;
}
function workersForIndicator(filter=selectedIndicatorFilter){
  return data.workers.filter(w=>{
    if(filter==='total') return w.active;
    return currentPersonnelState(w)===filter;
  }).sort((a,b)=>workerName(a).localeCompare(workerName(b),'fr'));
}
function openWorkerSection(workerId,tab='overview'){
  selectedWorkerId=workerId;
  selectedTab=tab;
  selectedPage='worker';
  renderWorkerList();
  renderCurrentView();
}
function pageTitle(key){
  return ({summary:'Tableau de bord',workers:'Travailleurs',salary:'Salaires',time:'Prestations',leave:'Congés',absence:'Maladies & absences',bonus:'Primes & avantages',document:'Documents',training:'Formations',equipment:'Matériel'}[key]||'Personnel');
}
function stateBadge(w){
  const state=currentPersonnelState(w), leave=currentLeave(w), absence=currentAbsence(w);
  if(state==='leave') return `<span class="badge warn">En congé</span>${leave?.endDate?` <span class="global-muted">jusqu’au ${dateLabel(leave.endDate)}</span>`:''}`;
  if(state==='illness') return `<span class="badge danger">Maladie</span>${absence?.endDate?` <span class="global-muted">jusqu’au ${dateLabel(absence.endDate)}</span>`:''}`;
  if(state==='other') return `<span class="badge warn">Autre absence</span>${absence?.endDate?` <span class="global-muted">jusqu’au ${dateLabel(absence.endDate)}</span>`:''}`;
  if(state==='active') return '<span class="badge active">Au travail</span>';
  return '<span class="badge inactive">Inactif</span>';
}
function renderGlobalWorkers(filter=selectedIndicatorFilter){
  const workers=workersForIndicator(filter);
  const label=indicatorLabel(filter);
  return `<div class="global-page"><div class="global-head"><div><h2>${esc(label)}</h2><p>${workers.length} personne${workers.length!==1?'s':''} dans cette vue.</p></div><button class="primary" onclick="openWorkerModal()">+ Nouveau travailleur</button></div>
  <div class="global-filter-tabs">${['total','active','leave','illness','other'].map(k=>`<button class="global-filter-btn ${filter===k?'active':''}" onclick="setIndicatorFilter('${k}')">${indicatorLabel(k)} (${workersForIndicator(k).length})</button>`).join('')}</div>
  ${workers.length?`<div class="global-table-wrap"><table class="data-table global-table"><thead><tr><th>Nom</th><th>Type</th><th>Fonction</th><th>État actuel</th><th>Entrée</th><th></th></tr></thead><tbody>${workers.map(w=>`<tr><td><strong>${esc(workerName(w))}</strong></td><td>${w.type==='worker'?'Ouvrier':'Employé'}</td><td>${esc(w.functionTitle||'—')}</td><td>${stateBadge(w)}</td><td>${dateLabel(w.startDate)}</td><td class="num"><button class="small" onclick="openWorkerSection('${w.id}','overview')">Ouvrir la fiche</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state global-empty"><div>Aucune personne dans cette catégorie.</div></div>'}</div>`;
}
function globalRecords(page){
  const spec={salary:['salaries','salary'],time:['timeEntries','time'],leave:['leaves','leave'],absence:['absences','absence'],bonus:['bonuses','bonus'],document:['documents','document'],training:['trainings','training'],equipment:['equipment','equipment']}[page];
  if(!spec) return [];
  const [array,tab]=spec;
  const rows=[];
  data.workers.forEach(w=>(w[array]||[]).forEach(r=>{ if(globalYearMatch(r)) rows.push({worker:w,record:r,tab}); }));
  return rows.sort((a,b)=>String(b.record.date||b.record.startDate||b.record.month||b.record.obtainedDate||b.record.assignedDate||'').localeCompare(String(a.record.date||a.record.startDate||a.record.month||a.record.obtainedDate||a.record.assignedDate||'')));
}
function renderGlobalRecords(page){
  const rows=globalRecords(page);
  const period=selectedSummaryYear==='all'?'Toutes années':selectedSummaryYear;
  const configs={
    salary:{cols:[['Mois',x=>esc(x.record.month||'—')],['Travailleur',x=>`<strong>${esc(workerName(x.worker))}</strong>`],['Brut',x=>money(x.record.gross),'num'],['Net',x=>money(x.record.net),'num'],['Coût employeur',x=>money(salaryCost(x.record)),'num']]},
    time:{cols:[['Date',x=>dateLabel(x.record.date)],['Travailleur',x=>`<strong>${esc(workerName(x.worker))}</strong>`],['Heures',x=>`${num(x.record.hours)} h`,'num'],['H. supp.',x=>`${num(x.record.overtimeHours)} h`,'num'],['Client / chantier',x=>esc(x.record.client||'—')]]},
    leave:{cols:[['Début',x=>dateLabel(x.record.startDate)],['Fin',x=>dateLabel(x.record.endDate)],['Travailleur',x=>`<strong>${esc(workerName(x.worker))}</strong>`],['Type',x=>cellValue(x.record,'type','leaveType')],['Jours',x=>num(x.record.days)||daysInclusive(x.record.startDate,x.record.endDate),'num'],['Statut',x=>esc(x.record.status||'—')]]},
    absence:{cols:[['Début',x=>dateLabel(x.record.startDate)],['Fin',x=>dateLabel(x.record.endDate)],['Travailleur',x=>`<strong>${esc(workerName(x.worker))}</strong>`],['Type',x=>cellValue(x.record,'type','absenceType')],['Certificat',x=>esc(x.record.certificate||'—')],['Note',x=>esc(x.record.note||'—')]]},
    bonus:{cols:[['Date',x=>dateLabel(x.record.date)],['Travailleur',x=>`<strong>${esc(workerName(x.worker))}</strong>`],['Type',x=>esc(x.record.type||'—')],['Description',x=>esc(x.record.description||'—')],['Montant',x=>money(x.record.amount),'num']]},
    document:{cols:[['Date',x=>dateLabel(x.record.date)],['Travailleur',x=>`<strong>${esc(workerName(x.worker))}</strong>`],['Type',x=>esc(x.record.type||'—')],['Document',x=>esc(x.record.name||'—')],['Échéance',x=>dateLabel(x.record.expiryDate)]]},
    training:{cols:[['Formation / brevet',x=>esc(x.record.name||'—')],['Travailleur',x=>`<strong>${esc(workerName(x.worker))}</strong>`],['Obtention',x=>dateLabel(x.record.obtainedDate)],['Expiration',x=>dateLabel(x.record.expiryDate)],['Organisme',x=>esc(x.record.provider||'—')]]},
    equipment:{cols:[['Matériel',x=>esc(x.record.name||'—')],['Travailleur',x=>`<strong>${esc(workerName(x.worker))}</strong>`],['Référence',x=>esc(x.record.serial||'—')],['Remis le',x=>dateLabel(x.record.assignedDate)],['Restitué le',x=>dateLabel(x.record.returnedDate)],['État',x=>esc(x.record.condition||'—')]]}
  };
  const cfg=configs[page];
  return `<div class="global-page"><div class="global-head"><div><h2>${pageTitle(page)}</h2><p>Vue globale du personnel · ${period} · ${rows.length} enregistrement${rows.length!==1?'s':''}.</p></div></div>
  ${rows.length?`<div class="global-table-wrap"><table class="data-table global-table"><thead><tr>${cfg.cols.map(c=>`<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(x=>`<tr>${cfg.cols.map(c=>`<td class="${c[2]||''}">${c[1](x)}</td>`).join('')}<td class="num"><button class="small" onclick="openWorkerSection('${x.worker.id}','${x.tab}')">Voir la fiche</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state global-empty"><div>Aucune donnée pour la période sélectionnée.</div></div>'}</div>`;
}
function renderGlobalSummary(){
  const active=data.workers.filter(w=>w.active), leave=workersForIndicator('leave'), illness=workersForIndicator('illness'), other=workersForIndicator('other');
  const birthDates=active.filter(w=>w.birthDate).length;
  const contractsEnding=active.filter(w=>w.endDate&&w.endDate>=today()).length;
  const trainingDue=active.reduce((n,w)=>n+(w.trainings||[]).filter(t=>t.expiryDate&&t.expiryDate>=today()).length,0);
  return `<div class="dashboard-grid"><aside class="quick-summary"><h3>Résumé rapide</h3><div class="quick-line"><span>Personnel actif</span><strong>${active.length}</strong></div><div class="quick-line"><span>En congé aujourd’hui</span><strong>${leave.length}</strong></div><div class="quick-line"><span>En maladie aujourd’hui</span><strong>${illness.length}</strong></div><div class="quick-line"><span>Autres absences</span><strong>${other.length}</strong></div><div class="quick-line"><span>Dates de naissance renseignées</span><strong>${birthDates}</strong></div><div class="quick-line"><span>Contrats avec échéance</span><strong>${contractsEnding}</strong></div><div class="quick-line"><span>Formations avec échéance</span><strong>${trainingDue}</strong></div></aside>
  <section class="overview-panel"><div class="global-head"><div><h2>Aperçu du personnel</h2><p>Situation actuelle de l’ensemble de l’équipe.</p></div><button class="small" onclick="setPersonnelPage('workers')">Voir tous les travailleurs</button></div>${renderGlobalWorkers('total')}</section></div>`;
}
function setPersonnelPage(page){
  selectedPage=page||'summary';
  selectedWorkerId='';
  if(page==='workers') selectedIndicatorFilter='total';
  renderSummary();
  renderWorkerList();
  renderCurrentView();
}
function renderCurrentView(){
  const workspace=document.querySelector('.workspace');
  if(!workspace) return;
  if(selectedPage==='worker'){
    workspace.classList.remove('global-view');
    renderMain();
    return;
  }
  workspace.classList.add('global-view');
  const root=document.getElementById('mainContent');
  if(!root) return;
  if(selectedPage==='summary') root.innerHTML=renderGlobalSummary();
  else if(selectedPage==='workers') root.innerHTML=renderGlobalWorkers(selectedIndicatorFilter);
  else root.innerHTML=renderGlobalRecords(selectedPage);
}

function renderMain(){
  const root=document.getElementById('mainContent'), w=getWorker();
  if(!w){ root.innerHTML=`<div class="empty-state"><div><h2>Gestion du personnel</h2><p>Sélectionnez un travailleur ou créez une nouvelle fiche.</p><button class="primary" onclick="openWorkerModal()">+ Ajouter un travailleur</button></div></div>`; return; }
  const period=selectedSummaryYear==='all'?'toutes années':selectedSummaryYear;
  const salaries=w.salaries.filter(inSelectedYear), bonuses=w.bonuses.filter(inSelectedYear), time=w.timeEntries.filter(inSelectedYear);
  const cost=salaries.reduce((s,x)=>s+salaryCost(x),0)+bonuses.reduce((s,x)=>s+bonusCost(x),0); const hours=time.reduce((s,x)=>s+num(x.hours)+num(x.overtimeHours),0); const leaveRemaining=Math.max(0,num(w.annualLeaveDays)-usedLegalLeave(w,selectedSummaryYear==='all'?String(new Date().getFullYear()):selectedSummaryYear));
  root.innerHTML=`<div class="profile-head"><div class="profile-title"><h2>${esc(workerName(w))}</h2><p>${esc(w.functionTitle||'Fonction non renseignée')} · ${w.type==='worker'?'Ouvrier':'Employé'} · ${esc(w.workRegime)}</p></div><div class="profile-actions"><button onclick="openWorkerModal('${w.id}')">Modifier</button><button onclick="window.print()">Imprimer</button></div></div>
  <div class="mini-grid"><div class="mini-card"><span>Coût employeur (${period})</span><strong>${money(cost)}</strong></div><div class="mini-card"><span>Heures enregistrées</span><strong>${hours.toLocaleString('fr-BE',{maximumFractionDigits:2})} h</strong></div><div class="mini-card"><span>Coût réel / heure</span><strong>${hours?money(cost/hours):'—'}</strong></div><div class="mini-card"><span>Congés restants</span><strong>${leaveRemaining.toLocaleString('fr-BE',{maximumFractionDigits:1})} j</strong></div></div>
  <div class="tabs">${Object.entries(tabLabels).map(([k,v])=>`<button class="tab-btn ${selectedTab===k?'active':''}" onclick="setWorkerTab('${k}')">${v}</button>`).join('')}</div>${renderTab(w)}`;
}
function renderTab(w){
  if(selectedTab==='overview') return renderOverview(w);
  const cfg={
    salary:{title:'Salaires',button:'Ajouter un salaire',type:'salary',records:w.salaries,cols:[['month','Mois'],['gross','Brut','money'],['net','Net','money'],['employerCharges','Charges patronales','money'],['cost','Coût total','calcSalary']]},
    time:{title:'Prestations / pointage',button:'Ajouter des prestations',type:'time',records:w.timeEntries,cols:[['date','Date','date'],['hours','Heures'],['overtimeHours','Heures supp.'],['client','Client / chantier'],['note','Note']]},
    leave:{title:'Congés',button:'Ajouter un congé',type:'leave',records:w.leaves,cols:[['startDate','Début','date'],['endDate','Fin','date'],['type','Type','leaveType'],['days','Jours'],['status','Statut']]},
    absence:{title:'Maladies & absences',button:'Ajouter une absence',type:'absence',records:w.absences,cols:[['startDate','Début','date'],['endDate','Fin','date'],['type','Type','absenceType'],['certificate','Certificat'],['note','Note']]},
    bonus:{title:'Primes & avantages',button:'Ajouter une prime / avantage',type:'bonus',records:w.bonuses,cols:[['date','Date','date'],['type','Type'],['description','Description'],['amount','Montant','money'],['employerCharges','Charges','money']]},
    document:{title:'Documents',button:'Ajouter un document',type:'document',records:w.documents,cols:[['date','Date','date'],['type','Type'],['name','Nom'],['expiryDate','Échéance','date'],['driveFileId','Drive','drive']]},
    training:{title:'Formations & habilitations',button:'Ajouter une formation',type:'training',records:w.trainings,cols:[['name','Formation / brevet'],['obtainedDate','Obtention','date'],['expiryDate','Expiration','date'],['provider','Organisme'],['note','Note']]},
    equipment:{title:'Matériel attribué',button:'Attribuer du matériel',type:'equipment',records:w.equipment,cols:[['name','Matériel'],['serial','N° / référence'],['assignedDate','Remis le','date'],['returnedDate','Restitué le','date'],['condition','État']]},
    history:{title:'Historique',button:'Ajouter une note historique',type:'history',records:w.history,cols:[['date','Date','date'],['type','Type'],['description','Description'],['author','Auteur']]}
  }[selectedTab];
  if(!cfg)return '';
  const records=[...cfg.records].sort((a,b)=>String(b.date||b.startDate||b.month||b.obtainedDate||b.assignedDate||'').localeCompare(String(a.date||a.startDate||a.month||a.obtainedDate||a.assignedDate||'')));
  const extra=selectedTab==='leave'?`<div class="notice">Droit annuel : <strong>${w.annualLeaveDays} j</strong> · Congés légaux utilisés (${selectedSummaryYear==='all'?new Date().getFullYear():selectedSummaryYear}) : <strong>${usedLegalLeave(w,selectedSummaryYear==='all'?String(new Date().getFullYear()):selectedSummaryYear)} j</strong></div>`:'';
  return `${extra}<div class="section-head"><h3>${cfg.title}</h3><button class="primary small" onclick="openRecordModal('${cfg.type}')">+ ${cfg.button}</button></div>${renderTable(cfg,records)}`;
}
function cellValue(item,key,format){
  if(format==='money')return money(item[key]); if(format==='date')return dateLabel(item[key]); if(format==='calcSalary')return money(salaryCost(item));
  if(format==='leaveType')return ({legal:'Congé légal',extra:'Extra-légal',recovery:'Récupération',unpaid:'Sans solde',circumstantial:'Petit chômage / circonstanciel'}[item[key]]||item[key]||'—');
  if(format==='absenceType')return ({illness:'Maladie',work_accident:'Accident du travail',justified:'Absence justifiée',unjustified:'Absence injustifiée',other:'Autre'}[item[key]]||item[key]||'—');
  if(format==='drive')return item.driveFileId?`<button class="small" onclick="openDriveDocument('${item.id}')">Ouvrir</button>`:'—'; return esc(item[key]??'—');
}
function renderTable(cfg,records){ if(!records.length)return '<div class="empty-state" style="min-height:220px"><div>Aucune donnée enregistrée.</div></div>';
  return `<div style="overflow:auto"><table class="data-table"><thead><tr>${cfg.cols.map(c=>`<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${records.map(r=>`<tr>${cfg.cols.map(c=>`<td class="${c[2]==='money'||c[2]==='calcSalary'?'num':''}">${cellValue(r,c[0],c[2])}</td>`).join('')}<td><div class="row-actions"><button class="small" onclick="openRecordModal('${cfg.type}','${r.id}')">Modifier</button><button class="small danger" onclick="deleteRecord('${cfg.type}','${r.id}')">Supprimer</button></div></td></tr>`).join('')}</tbody></table></div>`; }
function renderOverview(w){
  const activeAbs=w.absences.filter(isCurrentAbsence); const expiring=w.trainings.filter(t=>t.expiryDate&&t.expiryDate>=today()).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate)).slice(0,4);
  return `<div class="section-head"><h3>Fiche travailleur</h3><button class="small" onclick="openWorkerModal('${w.id}')">Modifier la fiche</button></div><div class="info-grid">
  ${info('Statut',w.active?'Actif':'Inactif')} ${info('Contrat',`${w.contractType} · ${w.startDate?dateLabel(w.startDate):'date non renseignée'}`)} ${info('Commission paritaire',w.jointCommittee||'—')} ${info('Régime',`${w.workRegime} · ${w.weeklyHours} h/sem.`)}
  ${info('Rémunération de base',w.baseWage?`${money(w.baseWage)} ${w.wageType==='hourly'?'/ h':'/ mois'}`:'—')} ${info('Téléphone / e-mail',[w.phone,w.email].filter(Boolean).join(' · ')||'—')} ${info('Adresse',w.address||'—')} ${info('IBAN',w.iban||'—')}</div>
  ${activeAbs.length?`<div class="notice"><strong>Absence en cours :</strong> ${activeAbs.map(a=>esc(cellValue(a,'type','absenceType'))+' depuis le '+dateLabel(a.startDate)).join(', ')}</div>`:''}
  ${expiring.length?`<div class="notice"><strong>Prochaines échéances formations :</strong> ${expiring.map(t=>`${esc(t.name)} (${dateLabel(t.expiryDate)})`).join(' · ')}</div>`:''}
  ${w.notes?`<div class="section-head"><h3>Notes</h3></div><div class="notice">${esc(w.notes).replace(/\n/g,'<br>')}</div>`:''}`;
}
function info(label,value){return `<div class="info"><span>${label}</span><strong>${esc(value)}</strong></div>`;}

function openModal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('modalBackdrop').classList.add('open'); }
function closeModal(){ document.getElementById('modalBackdrop').classList.remove('open'); document.getElementById('modal').innerHTML=''; }
function field(label,id,value='',type='text',extra='',full=false){ return `<div class="form-row ${full?'full':''}"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`; }
function selectField(label,id,value,options,full=false){ return `<div class="form-row ${full?'full':''}"><label for="${id}">${label}</label><select id="${id}">${options.map(([v,l])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select></div>`; }
function textareaField(label,id,value='',full=true){return `<div class="form-row ${full?'full':''}"><label for="${id}">${label}</label><textarea id="${id}">${esc(value)}</textarea></div>`;}
function val(id){return document.getElementById(id)?.value||'';}

function openWorkerModal(id=''){
  const w=id?data.workers.find(x=>x.id===id):normalizeWorker({}); const editing=!!id;
  openModal(`<div class="modal-head"><div><h2>${editing?'Modifier':'Nouveau'} travailleur</h2><div class="metric-sub">Informations contractuelles et administratives internes.</div></div><button class="ghost small" onclick="closeModal()">✕</button></div><div class="form-grid">
  ${field('Prénom','fFirst',w.firstName)}${field('Nom','fLast',w.lastName)}${selectField('Statut','fType',w.type,[['worker','Ouvrier'],['employee','Employé']])}${selectField('Situation','fActive',String(w.active),[['true','Actif'],['false','Sorti / inactif']])}
  ${field('Fonction','fFunction',w.functionTitle)}${field('Service / équipe','fDepartment',w.department)}${field('Date de naissance','fBirth',w.birthDate,'date')}${field('N° registre / référence interne','fNational',w.nationalNumber)}
  ${field('Téléphone','fPhone',w.phone,'tel')}${field('E-mail','fEmail',w.email,'email')}${field('Adresse','fAddress',w.address,'text','',true)}${field('Contact urgence','fEmergency',w.emergencyContact,'text','',true)}
  ${selectField('Type de contrat','fContract',w.contractType,[['CDI','CDI'],['CDD','CDD'],['Remplacement','Remplacement'],['Intérim','Intérim'],['Étudiant','Étudiant'],['Autre','Autre']])}${field('Commission paritaire','fCP',w.jointCommittee)}${field('Date d’entrée','fStart',w.startDate,'date')}${field('Date de sortie / fin','fEnd',w.endDate,'date')}
  ${field('Régime de travail','fRegime',w.workRegime)}${field('Heures / semaine','fWeekly',w.weeklyHours,'number','step="0.01" min="0"')}${selectField('Type de rémunération','fWageType',w.wageType,[['monthly','Mensuelle'],['hourly','Horaire']])}${field('Salaire / taux de base','fBaseWage',w.baseWage||'','number','step="0.01" min="0"')}
  ${field('Droit annuel congés (jours)','fAnnualLeave',w.annualLeaveDays,'number','step="0.5" min="0"')}${field('IBAN','fIban',w.iban)}${textareaField('Notes','fNotes',w.notes)}
  </div><div class="modal-actions"><button onclick="closeModal()">Annuler</button>${editing?'<button class="danger" onclick="deleteWorker()">Supprimer la fiche</button>':''}<button class="primary" onclick="saveWorker('${id}')">Enregistrer</button></div>`);
}
function saveWorker(id){
  let w=id?data.workers.find(x=>x.id===id):normalizeWorker({}); if(!val('fFirst').trim()&&!val('fLast').trim())return notify('Indiquez au moins un nom ou un prénom.');
  Object.assign(w,{firstName:val('fFirst').trim(),lastName:val('fLast').trim(),type:val('fType'),active:val('fActive')==='true',functionTitle:val('fFunction'),department:val('fDepartment'),birthDate:val('fBirth'),nationalNumber:val('fNational'),phone:val('fPhone'),email:val('fEmail'),address:val('fAddress'),emergencyContact:val('fEmergency'),contractType:val('fContract'),jointCommittee:val('fCP'),startDate:val('fStart'),endDate:val('fEnd'),workRegime:val('fRegime'),weeklyHours:num(val('fWeekly')),wageType:val('fWageType'),baseWage:num(val('fBaseWage')),annualLeaveDays:num(val('fAnnualLeave')),iban:val('fIban'),notes:val('fNotes')});
  if(!id){data.workers.push(w);selectedWorkerId=w.id;w.history.push({id:uid('hist'),date:today(),type:'Création',description:'Création de la fiche travailleur.',author:''});}
  else w.history.push({id:uid('hist'),date:today(),type:'Modification',description:'Fiche travailleur mise à jour.',author:''});
  saveLocal(`${workerName(w)} : fiche mise à jour`);closeModal();buildYearOptions();renderAll();notify('Fiche travailleur enregistrée.');
}
async function deleteWorker(){ const w=getWorker(); if(!w||!await BastUI.confirm(`Placer la fiche de ${workerName(w)} et toutes ses données dans la corbeille ?`,{type:'danger',title:'Mettre la fiche à la corbeille',confirmLabel:'Mettre à la corbeille'}))return; BastTrash.add({module:'Personnel',type:'Travailleur',label:workerName(w),storageKey:STORAGE_KEY,path:['workers'],item:w}); data.workers=data.workers.filter(x=>x.id!==w.id);selectedWorkerId='';saveLocal(`${workerName(w)} : fiche placée dans la corbeille`);closeModal();renderAll(); }

const recordConfigs={
 salary:{array:'salaries',title:'Salaire',fields:r=>`${field('Mois','rMonth',r.month||today().slice(0,7),'month')}${field('Brut','rGross',r.gross||'','number','step="0.01" min="0"')}${field('Net payé','rNet',r.net||'','number','step="0.01" min="0"')}${field('Charges patronales','rCharges',r.employerCharges||'','number','step="0.01" min="0"')}${field('Chèques-repas / part employeur','rMeal',r.mealVouchers||'','number','step="0.01" min="0"')}${field('Avantages / ATN / autres coûts','rBenefits',r.benefits||'','number','step="0.01" min="0"')}${field('Remboursements / indemnités','rReimb',r.reimbursements||'','number','step="0.01" min="0"')}${field('Date paiement','rPaid',r.paidDate||'','date')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({month:val('rMonth'),gross:num(val('rGross')),net:num(val('rNet')),employerCharges:num(val('rCharges')),mealVouchers:num(val('rMeal')),benefits:num(val('rBenefits')),reimbursements:num(val('rReimb')),paidDate:val('rPaid'),note:val('rNote')})},
 time:{array:'timeEntries',title:'Prestations',fields:r=>`${field('Date','rDate',r.date||today(),'date')}${field('Heures normales','rHours',r.hours||'','number','step="0.01" min="0"')}${field('Heures supplémentaires','rOvertime',r.overtimeHours||'','number','step="0.01" min="0"')}${field('Client / chantier','rClient',r.client||'')}${field('Déplacement / km','rTravel',r.travelKm||'','number','step="0.1" min="0"')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({date:val('rDate'),hours:num(val('rHours')),overtimeHours:num(val('rOvertime')),client:val('rClient'),travelKm:num(val('rTravel')),note:val('rNote')})},
 leave:{array:'leaves',title:'Congé',fields:r=>`${field('Début','rStart',r.startDate||today(),'date')}${field('Fin','rEnd',r.endDate||r.startDate||today(),'date')}${selectField('Type','rType',r.type||'legal',[['legal','Congé légal'],['extra','Extra-légal'],['recovery','Récupération'],['unpaid','Sans solde'],['circumstantial','Petit chômage / circonstanciel']])}${field('Nombre de jours','rDays',r.days||'','number','step="0.5" min="0"')}${selectField('Statut','rStatus',r.status||'approved',[['approved','Approuvé'],['requested','Demandé'],['cancelled','Annulé']])}${textareaField('Note','rNote',r.note||'')}`,read:()=>({startDate:val('rStart'),endDate:val('rEnd'),type:val('rType'),days:num(val('rDays'))||daysInclusive(val('rStart'),val('rEnd')),status:val('rStatus'),note:val('rNote')})},
 absence:{array:'absences',title:'Maladie / absence',fields:r=>`${field('Début','rStart',r.startDate||today(),'date')}${field('Fin','rEnd',r.endDate||'','date')}${selectField('Type','rType',r.type||'illness',[['illness','Maladie'],['work_accident','Accident du travail'],['justified','Absence justifiée'],['unjustified','Absence injustifiée'],['other','Autre']])}${selectField('Certificat médical','rCertificate',r.certificate||'no',[['no','Non'],['yes','Oui'],['not_required','Non requis']])}${field('Date de reprise','rReturn',r.returnDate||'','date')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({startDate:val('rStart'),endDate:val('rEnd'),type:val('rType'),certificate:val('rCertificate'),returnDate:val('rReturn'),note:val('rNote')})},
 bonus:{array:'bonuses',title:'Prime / avantage',fields:r=>`${field('Date','rDate',r.date||today(),'date')}${selectField('Type','rType',r.type||'Prime',[['Prime','Prime'],['Prime fin année','Prime de fin d’année'],['Bonus','Bonus'],['Commission','Commission'],['Déplacement','Indemnité déplacement'],['Vélo','Indemnité vélo'],['Chèques-repas','Chèques-repas'],['Écochèques','Écochèques'],['Téléphone','Téléphone'],['Véhicule','Véhicule / ATN'],['Autre','Autre']])}${field('Description','rDesc',r.description||'')}${field('Montant / coût employeur','rAmount',r.amount||'','number','step="0.01" min="0"')}${field('Charges patronales supplémentaires','rCharges',r.employerCharges||'','number','step="0.01" min="0"')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({date:val('rDate'),type:val('rType'),description:val('rDesc'),amount:num(val('rAmount')),employerCharges:num(val('rCharges')),note:val('rNote')})},
 training:{array:'trainings',title:'Formation / habilitation',fields:r=>`${field('Formation / brevet','rName',r.name||'')}${field('Organisme','rProvider',r.provider||'')}${field('Date obtention','rObtained',r.obtainedDate||today(),'date')}${field('Date expiration','rExpiry',r.expiryDate||'','date')}${field('N° certificat / référence','rRef',r.reference||'')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({name:val('rName'),provider:val('rProvider'),obtainedDate:val('rObtained'),expiryDate:val('rExpiry'),reference:val('rRef'),note:val('rNote')})},
 equipment:{array:'equipment',title:'Matériel attribué',fields:r=>`${field('Matériel / EPI','rName',r.name||'')}${field('N° série / référence','rSerial',r.serial||'')}${field('Date remise','rAssigned',r.assignedDate||today(),'date')}${field('Date restitution','rReturned',r.returnedDate||'','date')}${selectField('État','rCondition',r.condition||'Bon',[['Neuf','Neuf'],['Bon','Bon'],['Usagé','Usagé'],['À remplacer','À remplacer'],['Perdu','Perdu']])}${textareaField('Note','rNote',r.note||'')}`,read:()=>({name:val('rName'),serial:val('rSerial'),assignedDate:val('rAssigned'),returnedDate:val('rReturned'),condition:val('rCondition'),note:val('rNote')})},
 history:{array:'history',title:'Note historique',fields:r=>`${field('Date','rDate',r.date||today(),'date')}${selectField('Type','rType',r.type||'Note',[['Note','Note'],['Changement salaire','Changement salaire'],['Changement fonction','Changement fonction'],['Avertissement','Avertissement'],['Entretien','Entretien'],['Contrat','Contrat / avenant'],['Départ','Départ'],['Autre','Autre']])}${field('Auteur','rAuthor',r.author||'')}${textareaField('Description','rDesc',r.description||'')}`,read:()=>({date:val('rDate'),type:val('rType'),author:val('rAuthor'),description:val('rDesc')})},
 document:{array:'documents',title:'Document',fields:r=>`${field('Date','rDate',r.date||today(),'date')}${selectField('Type','rType',r.type||'Contrat',[['Contrat','Contrat'],['Avenant','Avenant'],['Fiche de paie','Fiche de paie'],['Certificat médical','Certificat médical'],['Attestation','Attestation'],['Document social','Document social'],['Permis / brevet','Permis / brevet'],['Autre','Autre']])}${field('Nom / description','rName',r.name||'')}${field('Date échéance','rExpiry',r.expiryDate||'','date')}<div class="form-row full"><label>Fichier (optionnel — stocké dans Google Drive appDataFolder)</label><input id="rFile" type="file"><div class="metric-sub">${r.driveFileId?'Un fichier Drive est déjà lié. Choisir un nouveau fichier le remplacera.':'Google Drive doit être connecté pour envoyer le fichier.'}</div></div>${textareaField('Note','rNote',r.note||'')}`,read:()=>({date:val('rDate'),type:val('rType'),name:val('rName'),expiryDate:val('rExpiry'),note:val('rNote')})}
};
function openRecordModal(type,id=''){
  const w=getWorker(), cfg=recordConfigs[type]; if(!w||!cfg)return; const arr=w[cfg.array], r=id?(arr.find(x=>x.id===id)||{}):{};
  openModal(`<div class="modal-head"><div><h2>${id?'Modifier':'Ajouter'} — ${cfg.title}</h2><div class="metric-sub">${esc(workerName(w))}</div></div><button class="small ghost" onclick="closeModal()">✕</button></div><div class="form-grid">${cfg.fields(r)}</div><div class="modal-actions"><button onclick="closeModal()">Annuler</button><button class="primary" onclick="saveRecord('${type}','${id}')">Enregistrer</button></div>`);
}
async function saveRecord(type,id=''){
  const w=getWorker(), cfg=recordConfigs[type]; if(!w||!cfg)return; const arr=w[cfg.array]; let r=id?arr.find(x=>x.id===id):null; const values=cfg.read(); if(!r){r={id:uid(type)};arr.push(r);} Object.assign(r,values);
  if(type==='document'){
    const file=document.getElementById('rFile')?.files?.[0];
    if(file){ if(!googleAccessToken){notify('Connectez Google Drive pour stocker le fichier. Les informations du document sont enregistrées sans fichier.');} else { const old=r.driveFileId; const uploaded=await uploadDocumentFile(w,file); if(uploaded){r.driveFileId=uploaded.id;r.driveFileName=uploaded.name;if(old&&old!==uploaded.id)deleteDriveFile(old);} } }
  }
  saveLocal(`${workerName(w)} : ${cfg.title.toLowerCase()} enregistré`); closeModal(); buildYearOptions(); renderAll(); notify('Enregistrement effectué.');
}
async function deleteRecord(type,id){ const w=getWorker(),cfg=recordConfigs[type];if(!w||!cfg)return; const arr=w[cfg.array],r=arr.find(x=>x.id===id);if(!r||!await BastUI.confirm('Supprimer cet enregistrement ?',{type:'danger',title:'Supprimer l’enregistrement'}))return; if(type==='document'&&r.driveFileId&&googleAccessToken&&await BastUI.confirm('Supprimer aussi le fichier associé de Google Drive ?',{type:'danger',title:'Supprimer également le fichier'})) await deleteDriveFile(r.driveFileId); w[cfg.array]=arr.filter(x=>x.id!==id);saveLocal(`${workerName(w)} : ${cfg.title.toLowerCase()} supprimé`);renderAll(); }

function renderAll(){ buildYearOptions();renderSummary();renderWorkerList();renderCurrentView(); }

function toggleFileMenu(event){event?.stopPropagation();document.getElementById('fileDropdown').classList.toggle('open');}
function closeFileMenu(){document.getElementById('fileDropdown').classList.remove('open');}
function exportDataLocal(){BastFileUtils.downloadJson(data,`bastcompta-personnel-${today()}.json`);}
async function importDataLocal(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const parsed=await BastFileUtils.parseJsonFile(file);if(!await BastUI.confirm('Importer ce fichier remplacera les données Personnel actuelles. Continuer ?',{title:'Remplacer les données Personnel'}))return;data=normalizeData(parsed);selectedWorkerId='';saveLocal('Import des données personnel');renderAll();notify('Données Personnel importées.');}catch{notify('Fichier invalide.');}}

function safePostToParent(message){try{window.parent?.postMessage(message,window.location.origin&&window.location.origin!=='null'?window.location.origin:'*');}catch{}}
async function driveList(){
  try{return await BastComptaDriveClient.listFiles(googleAccessToken,{q:`name='${DRIVE_SYNC_FILE_NAME}' and trashed=false`,fields:'nextPageToken,files(id,name,modifiedTime)',orderBy:'modifiedTime desc',pageSize:10});}catch(error){if(error?.status===401){googleAccessToken=null;setDriveState(false);safePostToParent({type:'BASTCOMPTA_REFRESH_TOKEN'});return [];}throw error;}
}
async function saveSyncToDrive(showToast=true){ if(!googleAccessToken){if(showToast)notify('Google Drive non connecté via le portail.');return false;} try{const existing=(await driveList())[0];await BastComptaDriveClient.uploadJson(googleAccessToken,{fileId:existing?.id||'',name:DRIVE_SYNC_FILE_NAME,value:data,fields:'id,name'});if(showToast)notify('Personnel sauvegardé sur Google Drive.');return true;}catch(e){if(e?.status===401){googleAccessToken=null;setDriveState(false);safePostToParent({type:'BASTCOMPTA_REFRESH_TOKEN'});}console.error(e);if(showToast)notify('Sauvegarde Google Drive impossible.');return false;} }
async function loadSyncDataFromDrive(confirmReplace=false,onlyIfNewer=false){if(!googleAccessToken)return false;try{const file=(await driveList())[0];if(!file)return false;if(confirmReplace&&!await BastUI.confirm('Charger les données Personnel depuis Google Drive et remplacer les données locales ?',{title:'Remplacer les données locales'}))return false;const parsed=normalizeData(await BastComptaDriveClient.readFile(googleAccessToken,file.id));if(onlyIfNewer&&data.workers.length&&String(parsed.updatedAt||'')<=String(data.updatedAt||''))return false;data=parsed;localStorage.setItem(STORAGE_KEY,JSON.stringify(data));selectedWorkerId='';renderAll();return true;}catch(e){console.error(e);return false;}}
async function exportJsonToDrive(){await saveSyncToDrive(true);}
async function loadFromDrive(){if(!googleAccessToken)return notify('Google Drive non connecté via le portail.');const ok=await loadSyncDataFromDrive(true);notify(ok?'Personnel chargé depuis Google Drive.':'Aucune sauvegarde Personnel trouvée sur Drive.');}
async function uploadDocumentFile(worker,file){
  const safeName=file.name.replace(/[^a-zA-Z0-9._ -]/g,'_');const name=`personnel-${worker.id}-${Date.now()}-${safeName}`;const metadata={name,parents:['appDataFolder'],appProperties:{module:'personnel',workerId:worker.id,originalName:file.name}};const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('file',file);const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{Authorization:`Bearer ${googleAccessToken}`},body:form});if(!res.ok){notify('Envoi du document sur Drive impossible.');return null;}return await res.json();
}
async function deleteDriveFile(id){try{await fetch(`https://www.googleapis.com/drive/v3/files/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${googleAccessToken}`}});}catch(e){console.warn(e);}}
async function openDriveDocument(recordId){const w=getWorker(),r=w?.documents.find(x=>x.id===recordId);if(!r?.driveFileId)return;if(!googleAccessToken)return notify('Google Drive non connecté.');try{const res=await fetch(`https://www.googleapis.com/drive/v3/files/${r.driveFileId}?alt=media`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});if(!res.ok)throw new Error();const blob=await res.blob();const url=URL.createObjectURL(blob);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{notify('Impossible d’ouvrir ce document Drive.');}}

window.addEventListener('message',async event=>{
  if(window.location.origin&&window.location.origin!=='null'&&event.origin!==window.location.origin)return;const m=event.data||{};
  if(m.type==='BASTCOMPTA_GOOGLE_TOKEN'){googleAccessToken=m.accessToken||null;setDriveState(!!googleAccessToken);if(googleAccessToken){const loaded=await loadSyncDataFromDrive(false,true);if(loaded)notify('Personnel actualisé depuis Google Drive.');}}
  if(m.type==='BASTCOMPTA_GOOGLE_LOGOUT'){googleAccessToken=null;setDriveState(false);}
  if(m.type==='BASTCOMPTA_SET_ACTIVE_PAGE'){
    const allowed=['summary','workers','salary','time','leave','absence','bonus','document','training','equipment'];
    if(allowed.includes(m.pageKey)) setPersonnelPage(m.pageKey);
  }
});
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){data=loadData();renderAll();}});
document.addEventListener('click',e=>{if(!e.target.closest('#fileDropdown'))closeFileMenu();if(e.target===document.getElementById('modalBackdrop'))closeModal();});

async function saveFromPortalGlobal(options={}){saveLocal('Sauvegarde globale Personnel');const drive=googleAccessToken?await saveSyncToDrive(false):false;return{ok:true,module:'personnel',local:true,drive:!!drive};}
window.BastComptaModule={name:'Personnel',save:saveFromPortalGlobal,saveData:saveFromPortalGlobal,getChangeSnapshot:()=>data,getStatus:()=>({ready:true,module:'personnel'})};

setDriveState(false);renderAll();safePostToParent({type:'BASTCOMPTA_DRIVE_STATUS_REQUEST'});
